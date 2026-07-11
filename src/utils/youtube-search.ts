import { config } from '../config/index.js';
import fs from 'fs';
import { logger } from './logger.js';
import { execFile, spawn, execSync } from 'child_process';
import path from 'path';
import { Readable } from 'stream';
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

export async function ensureYtDlp(): Promise<string> {
  const binDir = path.join(ROOT_DIR, 'bin');
  if (!fs.existsSync(binDir)) {
    fs.mkdirSync(binDir, { recursive: true });
  }

  const stats = fs.existsSync(YTDLP_PATH) ? fs.statSync(YTDLP_PATH) : null;
  const shouldDownload = !stats || (Date.now() - stats.mtimeMs > 6 * 60 * 60 * 1000);
  
  if (shouldDownload) {
    logger.info('Updating yt-dlp binary to the latest version...');
    const url = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux';
    try {
      await new Promise((resolve, reject) => {
        import('child_process').then(cp => {
          cp.exec(`curl -L ${url} -o "${YTDLP_PATH}"`, (err) => {
            if (err) reject(err); else resolve(null);
          });
        });
      });
      fs.chmodSync(YTDLP_PATH, 0o755);
    } catch (err) {
      logger.error('Failed to update yt-dlp:', err);
      if (!fs.existsSync(YTDLP_PATH)) {
        throw new Error('Could not download yt-dlp binary.');
      }
    }
  }

  return YTDLP_PATH;
}

function buildYtDlpArgs(baseArgs: string[]): string[] {
  const args = [...baseArgs];

  const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  args.push('--user-agent', userAgent);
  args.push('--force-ipv4');
  args.push('--no-check-certificates');
  args.push('--geo-bypass');
  args.push('--referer', 'https://www.youtube.com/');
  args.push('--no-cache-dir');
  args.push('--js-runtimes', `node:${process.execPath}`);
  args.push('--add-header', 'Accept-Language: en-US,en;q=0.9');
  args.push('--add-header', 'Sec-Fetch-Mode: navigate');
  
  if (config.hasCookies) {
    const resolvedPath = config.absoluteCookiePath;
    if (fs.existsSync(resolvedPath)) {
      args.push('--cookies', resolvedPath);
    }
  } else {
    // Default extractor args to help with bot detection if no cookies provided
    args.push('--extractor-args', 'youtube:player_client=ios,android,web');
  }
  
  const proxy = process.env.YT_PROXY;
  if (proxy) args.push('--proxy', proxy);

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

export async function runYtDlp(args: string[]): Promise<string> {
  const binaryPath = await ensureYtDlp();
  return new Promise((resolve, reject) => {
    logger.info(`Running yt-dlp search/metadata command...`);
    
    execFile(binaryPath, args, { maxBuffer: 15 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (stderr && (stderr.includes('Sign in') || stderr.includes('bot'))) {
        logger.error(`yt-dlp detected as bot! Output: ${stderr.trim()}`);
      }
      
      if (error) {
        if (stdout.trim()) {
          return resolve(stdout);
        }
        return reject(error);
      }
      resolve(stdout);
    });
  });
}

export async function searchYouTube(query: string, limit: number = 5, platform: string = 'youtube'): Promise<YouTubeSearchResult[]> {
  const isUrl = query.startsWith('http://') || query.startsWith('https://');

  try {
    let baseArgs: string[];
    
    if (isUrl) {
      baseArgs = [
        query,
        '--flat-playlist',
        '--dump-json',
        '--no-warnings'
      ];
    } else {
      const searchPrefix = platform === 'soundcloud' ? `scsearch${limit}:` : `ytsearch${limit}:`;
      baseArgs = [
        `${searchPrefix}${query}`,
        '--flat-playlist',
        '--dump-json',
        '--no-warnings'
      ];
    }

    const args = buildYtDlpArgs(baseArgs);
    const output = await runYtDlp(args);
    
    if (output) {
      const lines = output.trim().split('\n');
      const results: YouTubeSearchResult[] = [];
      
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const item = JSON.parse(line);
          if (item._type === 'playlist' || item._type === 'url') {
            if (item.url && (item.url.includes('channel/') || item.url.includes('@'))) continue;
          }
          
          const id = item.id || '';
          results.push({
            id,
            title: item.title || item.fulltitle || 'Unknown Title',
            url: item.webpage_url || item.url || (id ? `https://www.youtube.com/watch?v=${id}` : (isUrl ? query : '')),
            thumbnail: item.thumbnails?.[0]?.url || item.thumbnail || '',
            duration: item.duration || 0,
            durationString: item.duration_string || formatDuration(item.duration || 0)
          });
        } catch { }
      }
      
      if (results.length > 0) return results.slice(0, limit);
    }
  } catch (err: any) {
    logger.warn(`searchYouTube via yt-dlp failed for query "${query}":`, err.message || err);
  }

  // Fallback to youtube-sr for search only
  if (!isUrl) {
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
  }

  return [];
}

export async function ytDlpGetMetadata(url: string): Promise<YouTubeSearchResult[]> {
  return searchYouTube(url, 50); // Reuse searchYouTube with high limit for playlists
}

export async function spawnYtDlpStream(url: string): Promise<Readable> {
  const binaryPath = await ensureYtDlp();
  const baseArgs = [
    '--extract-audio',
    '--audio-format', 'opus',
    '--audio-quality', '0',
    '--buffer-size', '64K',
    '--no-playlist',
    '-o', '-',
    url
  ];

  const args = buildYtDlpArgs(baseArgs);

  logger.info(`Spawning high-quality yt-dlp opus stream: "${url}"`);
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

export async function spawnStream(url: string): Promise<Readable> {
  // Use only yt-dlp as requested
  return spawnYtDlpStream(url);
}

export const YouTubeSearch = {
  async search(query: string, options?: { limit?: number; platform?: string }) {
    const limit = options?.limit || 5;
    const platform = options?.platform || 'youtube';
    const results = await searchYouTube(query, limit, platform);
    return results.map(r => ({
      title: r.title,
      url: r.url,
      thumbnail: { url: r.thumbnail },
      duration: r.duration * 1000, // standard conversion to ms
      durationFormatted: r.durationString
    }));
  },
  
  async searchOne(query: string, platform: string = 'youtube') {
    const results = await this.search(query, { limit: 1, platform });
    return results.length > 0 ? results[0] : null;
  },

  spawnStream
};
