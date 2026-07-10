import { config } from '../config/index.js';
import fs from 'fs';
import { logger } from './logger.js';
import { execFile, spawn, execSync } from 'child_process';
import path from 'path';
import { Readable } from 'stream';
import play from 'play-dl';
import { YouTube } from 'youtube-sr';

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
 * Luôn kiểm tra và tải bản mới nhất nếu bản cũ đã lỗi thời.
 */
async function ensureYtDlp(): Promise<string> {
  const binDir = path.join(ROOT_DIR, 'bin');
  if (!fs.existsSync(binDir)) {
    fs.mkdirSync(binDir, { recursive: true });
  }

  // Force re-download to ensure latest version periodically or if missing
  const stats = fs.existsSync(YTDLP_PATH) ? fs.statSync(YTDLP_PATH) : null;
  // If older than 12 hours or missing, re-download
  const shouldDownload = !stats || (Date.now() - stats.mtimeMs > 12 * 60 * 60 * 1000);
  
  if (shouldDownload) {
    logger.info('Downloading/Updating latest yt-dlp binary (ELF linux)...');
    const url = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux';
    try {
      execSync(`curl -L ${url} -o "${YTDLP_PATH}"`, { stdio: 'inherit' });
      fs.chmodSync(YTDLP_PATH, 0o755);
    } catch (err) {
      logger.error('Failed to download yt-dlp:', err);
      if (!fs.existsSync(YTDLP_PATH)) {
        throw new Error('Could not download yt-dlp. Please install it manually in ./bin/yt-dlp');
      }
    }
  } else {
    // Attempt self-update if possible
    try {
      execSync(`"${YTDLP_PATH}" -U`, { stdio: 'ignore' });
    } catch {
      // Ignore update errors
    }
    fs.chmodSync(YTDLP_PATH, 0o755);
  }

  return YTDLP_PATH;
}

/**
 * Helper to build yt-dlp arguments with cookies and PO Token
 */
function buildYtDlpArgs(baseArgs: string[]): string[] {
  const args = [...baseArgs];

  if (config.hasCookies) {
    const resolvedPath = config.absoluteCookiePath;
    if (fs.existsSync(resolvedPath)) {
      const stats = fs.statSync(resolvedPath);
      logger.info(`Using cookies from ${resolvedPath} (Size: ${stats.size} bytes)`);
      args.push('--cookies', resolvedPath);
    }
  }

  const poToken = process.env.YT_PO_TOKEN;
  const visitorData = process.env.YT_VISITOR_DATA;

  // Use a modern iOS User-Agent to match the player-client for better reliability
  const userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
  args.push('--user-agent', userAgent);
  args.push('--force-ipv4');
  args.push('--no-check-certificates');
  args.push('--geo-bypass');
  args.push('--referer', 'https://www.youtube.com/');
  args.push('--add-header', 'Accept-Language:en-US,en;q=0.9');

  // Build extractor args
  // Use a mix of clients that are less likely to be blocked
  // tv_downgraded and web_creator often work when ios/android fail for some videos
  const extractorArgs = [
    'youtube:player-client=ios,android,mweb,tv_downgraded,web',
    'youtube:player_skip=configs,webpage'
  ];

  if (poToken) {
    const formattedPoToken = poToken.startsWith('web+') ? poToken : `web+${poToken}`;
    extractorArgs.push(`po_token=${formattedPoToken}`);
    if (visitorData) {
      extractorArgs.push(`visitor_data=${visitorData}`);
    }
  }

  args.push('--extractor-args', extractorArgs.join(';'));
  
  const proxy = process.env.YT_PROXY;
  if (proxy) {
    args.push('--proxy', proxy);
  }

  return args;
}

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
 * Searches for YouTube videos and returns a list of results.
 * Uses play-dl primarily for speed, falls back to yt-dlp if needed.
 */
export async function searchYouTube(query: string, limit: number = 5): Promise<YouTubeSearchResult[]> {
  // 1. Try yt-dlp first (most reliable for search results when cookies are involved)
  try {
    const baseArgs = [
      `ytsearch${limit}:${query}`,
      '--flat-playlist',
      '--dump-json',
      '--js-runtimes', 'node'
    ];

    const args = buildYtDlpArgs(baseArgs);
    const output = await runYtDlp(args);
    
    if (output) {
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
          results.push({
            id,
            title: item.title || 'Unknown Title',
            url: item.url || `https://www.youtube.com/watch?v=${id}`,
            thumbnail: item.thumbnails?.[0]?.url || item.thumbnail || '',
            duration: item.duration || 0,
            durationString: item.duration_string || formatDuration(item.duration || 0)
          });
        } catch {
          // Skip invalid JSON
        }
      }
      
      if (results.length > 0) return results;
    }
  } catch (err: any) {
    logger.warn(`searchYouTube via yt-dlp failed for query "${query}":`, err.message || err);
  }

  // 2. Try play-dl as fallback
  try {
    const playResults = await play.search(query, { limit, source: { youtube: 'video' } });
    if (playResults && playResults.length > 0) {
      return playResults.map(v => ({
        id: v.id || '',
        title: v.title || 'Unknown Title',
        url: v.url,
        thumbnail: v.thumbnails[0]?.url || '',
        duration: v.durationInSec,
        durationString: v.durationRaw || formatDuration(v.durationInSec)
      }));
    }
  } catch (err: any) {
    logger.warn(`play-dl search failed, trying youtube-sr fallback: ${err.message || err}`);
  }

  // 3. Fallback to youtube-sr
  try {
    const srResults = await YouTube.search(query, { limit, type: 'video' });
    if (srResults && srResults.length > 0) {
      return srResults.map(v => ({
        id: v.id || '',
        title: v.title || 'Unknown Title',
        url: v.url,
        thumbnail: v.thumbnail?.url || '',
        duration: v.duration / 1000,
        durationString: v.durationFormatted || formatDuration(v.duration / 1000)
      }));
    }
  } catch (err: any) {
    logger.warn(`youtube-sr search failed: ${err.message || err}`);
  }

  return [];
}

/**
 * Fetches metadata for an individual video or a playlist using yt-dlp.
 * Falls back to yt-dlp if play-dl fails or if it's a non-YouTube URL.
 */
export async function ytDlpGetMetadata(url: string): Promise<YouTubeSearchResult[]> {
  // Try yt-dlp first
  try {
    const baseArgs = [
      url,
      '--flat-playlist',
      '--dump-json',
      '--js-runtimes', 'node'
    ];
    const args = buildYtDlpArgs(baseArgs);
    const output = await runYtDlp(args);
    if (output) {
      const lines = output.trim().split('\n');
      const results: YouTubeSearchResult[] = [];
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const item = JSON.parse(line);
          const id = item.id || '';
          results.push({
            id,
            title: item.title || 'Unknown Title',
            url: item.webpage_url || item.url || (id ? `https://www.youtube.com/watch?v=${id}` : url),
            thumbnail: item.thumbnails?.[0]?.url || item.thumbnail || '',
            duration: item.duration || 0,
            durationString: item.duration_string || formatDuration(item.duration || 0)
          });
        } catch {}
      }
      if (results.length > 0) return results;
    }
  } catch (err: any) {
    logger.warn(`ytDlpGetMetadata via yt-dlp failed: ${err.message}`);
  }

  // Fallback to play-dl
  if (url.includes('youtube.com') || url.includes('youtu.be')) {
    try {
      const type = await play.validate(url);
      if (type === 'yt_video') {
        const videoInfo = await play.video_basic_info(url);
        const v = videoInfo.video_details;
        return [{
          id: v.id || '',
          title: v.title || 'Unknown Title',
          url: v.url,
          thumbnail: v.thumbnails[0]?.url || '',
          duration: v.durationInSec,
          durationString: v.durationRaw || formatDuration(v.durationInSec)
        }];
      } else if (type === 'yt_playlist') {
        const playlistInfo = await play.playlist_info(url, { incomplete: true });
        const videos = await playlistInfo.all_videos();
        return videos.map(v => ({
          id: v.id || '',
          title: v.title || 'Unknown Title',
          url: v.url,
          thumbnail: v.thumbnails[0]?.url || '',
          duration: v.durationInSec,
          durationString: v.durationRaw || formatDuration(v.durationInSec)
        }));
      }
    } catch (err: any) {
      logger.warn(`play-dl metadata fetch failed, falling back to yt-dlp: ${err.message || err}`);
    }
  }

  // Final error if all methods failed
  throw new Error(`Không tìm thấy kết quả hoặc không thể parse metadata từ URL: ${url}`);
}

/**
 * Spawns a yt-dlp audio stream process and returns its stdout.
 */
export async function spawnYtDlpStream(url: string): Promise<Readable> {
  const binaryPath = await ensureYtDlp();
  const baseArgs = [
    '-f', 'bestaudio',
    '--no-playlist',
    '--buffer-size', '16K',
    '-o', '-',
    '--js-runtimes', 'node',
    url
  ];

  const args = buildYtDlpArgs(baseArgs);

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

/**
 * Spawns an audio stream process.
 * Tries play-dl first for YouTube URLs as it is often more resilient,
 * falls back to yt-dlp if needed or for other sources.
 */
export async function spawnStream(url: string): Promise<Readable> {
  // Prioritize yt-dlp for streaming as it is currently more reliable for bypassing bot detection
  // with custom extractor args and cookies.
  try {
    return await spawnYtDlpStream(url);
  } catch (err: any) {
    logger.warn(`yt-dlp primary stream failed for "${url}", trying play-dl fallback: ${err.message || err}`);
    
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
      try {
        const streamOptions: any = {
          quality: 2,
          discordPlayerCompatibility: true
        };
        const stream = await play.stream(url, streamOptions);
        return stream.stream;
      } catch (playErr: any) {
        logger.error(`Both yt-dlp and play-dl failed to stream "${url}":`, playErr.message || playErr);
        throw playErr;
      }
    }
    throw err;
  }
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
  },

  spawnStream
};
