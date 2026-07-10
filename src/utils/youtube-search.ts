import { config } from '../config/index.js';
import fs from 'fs';
import { logger } from './logger.js';
import { execFile, spawn, execSync } from 'child_process';
import path from 'path';
import { Readable } from 'stream';

export interface YouTubeSearchResult {
  id: string;
  title: string;
  url: string;
  thumbnail: string;
  duration: number; // in seconds
  durationString: string;
}

const ROOT_DIR = process.cwd();
const YTDLP_PATH = path.join(ROOT_DIR, 'bin', 'yt-dlp');

/**
 * Đảm bảo yt-dlp tồn tại và có quyền thực thi.
 * Nếu file bị lỗi (như lỗi SyntaxError PK trên Render), nó sẽ cố gắng tải lại bản chuẩn.
 */
async function ensureYtDlp(): Promise<string> {
  const binDir = path.join(ROOT_DIR, 'bin');
  if (!fs.existsSync(binDir)) {
    fs.mkdirSync(binDir, { recursive: true });
  }

  // Kiểm tra xem file có chạy được không
  let needsDownload = !fs.existsSync(YTDLP_PATH);
  
  if (!needsDownload) {
    try {
      // Thử chạy --version để kiểm tra tính toàn vẹn
      execSync(`"${YTDLP_PATH}" --version`, { stdio: 'ignore' });
    } catch (err) {
      logger.warn('yt-dlp binary exists but is not working. Attempting to download a fresh copy...');
      needsDownload = true;
    }
  }

  if (needsDownload) {
    logger.info('Downloading latest yt-dlp binary for Linux...');
    const url = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';
    
    try {
      // Sử dụng curl hoặc wget (thường có sẵn trên Render/Linux)
      execSync(`curl -L ${url} -o "${YTDLP_PATH}"`, { stdio: 'inherit' });
      fs.chmodSync(YTDLP_PATH, 0o755);
      logger.info('yt-dlp downloaded and permissions set.');
    } catch (err) {
      logger.error('Failed to download yt-dlp via curl:', err);
      throw new Error('Could not prepare yt-dlp binary. Please ensure curl is installed.');
    }
  } else {
    // Đảm bảo quyền thực thi kể cả khi file đã tồn tại
    const stats = fs.statSync(YTDLP_PATH);
    if ((stats.mode & fs.constants.S_IXUSR) === 0) {
      fs.chmodSync(YTDLP_PATH, 0o755);
    }
  }

  return YTDLP_PATH;
}

// Hardcoded PO Token & Visitor Data for fallback/default usage
const DEFAULT_PO_TOKEN = 'MlWhNcrk5yPATaELnTfvHxmyJKakOlVFwds0rub0sf7WS0SCCaIK9dL';
const DEFAULT_VISITOR_DATA = 'CgtQSEdTMU5EWEt2VSjt58DSBjIKCgJWThIEGgAgEmLfAgrcAjE5LllUPU5kSGFaU3M3VmdhT243NnIzdFk2aW1kNHB6aWdCTFpueVJ6NkkyMnpDUmFrQ0xfdGlRUk0zTWJiNEFVem1xNk1wS1A2d3BLMGVTQnJjREtmZlVxMEJHY0N3WWMwU0NnYWw0MVJUUkJERW9wVXpQRFBONV93aHZ3Wl9kdDgxWndSZUEzWUt3UzIybWRWbjFWVEtIYXpCazMzNTZhelhyUklMakU2Mmx2aU5UR3VYWVI2cFFaYXM2OHJyeW1wOTJOcTNzTVBXekdBaHg2eVJkYWh4UnQ5bHN5d3MzNGlwR0RZRXVtaHFxcXlwVnFyQU83Q1dHMFRJeFBISXNQUGNXWHNLOG5QSS10SjR5dE5nWTBIWDh3aVBkVGVjbGNVazNKMXQ5bFZPa05fS3AzYWlFOTdULVNlYUNFR3d4dlNUbU5rUHphUGhEdDRCQkJfS1FKOGpGbE16UQ';

function formatDuration(durationSec: number): string {
  if (isNaN(durationSec) || durationSec <= 0) return '0:00';
  const hours = Math.floor(durationSec / 3600);
  const minutes = Math.floor((durationSec % 3600) / 60);
  const seconds = Math.floor(durationSec % 60);
  
  const parts = [];
  if (hours > 0) {
    parts.push(hours);
    parts.push(minutes.toString().padStart(2, '0'));
  } else {
    parts.push(minutes);
  }
  parts.push(seconds.toString().padStart(2, '0'));
  return parts.join(':');
}

/**
 * Runs the yt-dlp binary with specific arguments and returns stdout.
 */
export async function runYtDlp(args: string[]): Promise<string> {
  const binaryPath = await ensureYtDlp();
  return new Promise((resolve, reject) => {
    logger.info(`Running yt-dlp command: "${binaryPath} ${args.map(a => a.includes(' ') ? `"${a}"` : a).join(' ')}"`);
    execFile(binaryPath, args, { maxBuffer: 15 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        logger.warn(`yt-dlp warning/error output: ${stderr || error.message}`);
        // Even if there's a minor error exit code, if we have valid stdout, use it
        if (stdout.trim()) {
          return resolve(stdout);
        }
        return reject(error);
      }
      resolve(stdout);
    });
  });
}

/**
 * Searches YouTube using yt-dlp's fast search options.
 */
export async function searchYouTube(query: string, limit: number = 5): Promise<YouTubeSearchResult[]> {
  try {
    const args = [
      `ytsearch${limit}:${query}`,
      '--flat-playlist',
      '--dump-json',
      '--js-runtimes', 'node'
    ];

    // Pass cookies if configured and exists
    if (config.hasCookies) {
      args.push('--cookies', config.absoluteCookiePath);
    }

    // Pass PO Token if configured
    const poToken = process.env.YT_PO_TOKEN || DEFAULT_PO_TOKEN;
    const visitorData = process.env.YT_VISITOR_DATA || DEFAULT_VISITOR_DATA;
    if (poToken) {
      // Use the format suggested by yt-dlp warnings: CLIENT.CONTEXT+PO_TOKEN
      args.push('--extractor-args', `youtube:po_token=web+${poToken}`);
      if (visitorData) {
        args.push('--extractor-args', `youtube:visitor_data=${visitorData}`);
      }
    }

    // Set a modern browser user-agent to help bypass bot detection on Render
    args.push('--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Force IPv4 and try multiple clients to bypass bot detection
    args.push('--force-ipv4');
    args.push('--extractor-args', 'youtube:player-client=web,android');

    // Pass proxy if configured
    const proxy = process.env.YT_PROXY;
    if (proxy) {
      args.push('--proxy', proxy);
    }
    
    const output = await runYtDlp(args);
    const lines = output.trim().split('\n');
    const results: YouTubeSearchResult[] = [];
    
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const item = JSON.parse(line);
        // Skip channel entries
        if (item._type === 'playlist' || item._type === 'url') {
          if (item.url && (item.url.includes('channel/') || item.url.includes('@'))) continue;
        }
        
        const id = item.id || '';
        const title = item.title || 'Unknown Title';
        const url = item.url || `https://www.youtube.com/watch?v=${id}`;
        const thumbnail = item.thumbnails?.[0]?.url || item.thumbnail || '';
        const duration = item.duration || 0;
        const durationString = item.duration_string || formatDuration(duration);
        
        results.push({
          id,
          title,
          url,
          thumbnail,
          duration,
          durationString
        });
      } catch {
        // Skip individual parsing error
      }
    }
    
    return results;
  } catch (err: any) {
    logger.error(`searchYouTube via yt-dlp failed for query "${query}":`, err.message || err);
    return [];
  }
}

/**
 * Fetches metadata for an individual video or a playlist using yt-dlp.
 */
export async function ytDlpGetMetadata(url: string): Promise<YouTubeSearchResult[]> {
  try {
    const args = [
      url,
      '--flat-playlist',
      '--dump-json',
      '--js-runtimes', 'node'
    ];

    if (config.hasCookies) {
      args.push('--cookies', config.absoluteCookiePath);
    }

    // Pass PO Token if configured
    const poToken = process.env.YT_PO_TOKEN || DEFAULT_PO_TOKEN;
    const visitorData = process.env.YT_VISITOR_DATA || DEFAULT_VISITOR_DATA;
    if (poToken) {
      args.push('--extractor-args', `youtube:po_token=web+${poToken}`);
      if (visitorData) {
        args.push('--extractor-args', `youtube:visitor_data=${visitorData}`);
      }
    }

    // Set a modern browser user-agent
    args.push('--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Force IPv4 and try multiple clients
    args.push('--force-ipv4');
    args.push('--extractor-args', 'youtube:player-client=web,android');

    // Pass proxy if configured
    const proxy = process.env.YT_PROXY;
    if (proxy) {
      args.push('--proxy', proxy);
    }
    
    const output = await runYtDlp(args);
    const lines = output.trim().split('\n');
    const results: YouTubeSearchResult[] = [];
    
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const item = JSON.parse(line);
        const id = item.id || '';
        const title = item.title || 'Unknown Title';
        const itemUrl = item.webpage_url || item.url || (id ? `https://www.youtube.com/watch?v=${id}` : url);
        const thumbnail = item.thumbnails?.[0]?.url || item.thumbnail || '';
        const duration = item.duration || 0;
        const durationString = item.duration_string || formatDuration(duration);
        
        results.push({
          id,
          title,
          url: itemUrl,
          thumbnail,
          duration,
          durationString
        });
      } catch {
        // Skip invalid line
      }
    }
    
    if (results.length === 0) {
      throw new Error(`Không tìm thấy kết quả hoặc không thể parse metadata từ URL: ${url}`);
    }
    
    return results;
  } catch (err: any) {
    logger.error(`ytDlpGetMetadata failed for URL "${url}":`, err.message || err);
    throw err;
  }
}

/**
 * Spawns a yt-dlp audio stream process and returns its stdout.
 */
export async function spawnYtDlpStream(url: string): Promise<Readable> {
  const binaryPath = await ensureYtDlp();
  const args = [
    '-f', 'bestaudio',
    '--no-playlist',
    '--buffer-size', '16K',
    '-o', '-',
    '--js-runtimes', 'node',
    url
  ];

  if (config.hasCookies) {
    args.push('--cookies', config.absoluteCookiePath);
  }

  // Pass PO Token if configured
  const poToken = process.env.YT_PO_TOKEN || DEFAULT_PO_TOKEN;
  const visitorData = process.env.YT_VISITOR_DATA || DEFAULT_VISITOR_DATA;
  if (poToken) {
    args.push('--extractor-args', `youtube:po_token=web+${poToken}`);
    if (visitorData) {
      args.push('--extractor-args', `youtube:visitor_data=${visitorData}`);
    }
  }

  // Set a modern browser user-agent
  args.push('--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  // Force IPv4 and try multiple clients
  args.push('--force-ipv4');
  args.push('--extractor-args', 'youtube:player-client=web,android');

  // Pass proxy if configured
  const proxy = process.env.YT_PROXY;
  if (proxy) {
    args.push('--proxy', proxy);
  }

  logger.info(`Spawning yt-dlp audio stream: "${url}"`);
  const child = spawn(binaryPath, args, {
    stdio: ['ignore', 'pipe', 'pipe']
  });

  child.stderr.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg) {
      logger.warn(`[yt-dlp stream stderr]: ${msg}`);
    }
  });

  child.on('error', (err) => {
    logger.error(`yt-dlp stream process failed to spawn for "${url}":`, err);
  });

  child.on('exit', (code, signal) => {
    if (code !== 0 && code !== null) {
      logger.warn(`yt-dlp stream process exited with code ${code}, signal: ${signal}`);
    } else {
      logger.info(`yt-dlp stream process completed successfully.`);
    }
  });

  return child.stdout;
}

export const YouTubeSearch = {
  async search(query: string, options?: { limit?: number }) {
    const limit = options?.limit || 5;
    const results = await searchYouTube(query, limit);
    return results.map(r => ({
      title: r.title,
      url: r.url,
      thumbnail: { url: r.thumbnail },
      duration: r.duration * 1000, // standard conversion to ms
      durationFormatted: r.durationString
    }));
  },
  
  async searchOne(query: string) {
    const results = await this.search(query, { limit: 1 });
    return results.length > 0 ? results[0] : null;
  }
};
