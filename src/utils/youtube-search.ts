import { config } from '../config/index.js';
import fs from 'fs';
import { logger } from './logger.js';
import { execFile, spawn } from 'child_process';
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
export function runYtDlp(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    logger.info(`Running yt-dlp command: "${YTDLP_PATH} ${args.map(a => a.includes(' ') ? `"${a}"` : a).join(' ')}"`);
    execFile(YTDLP_PATH, args, { maxBuffer: 15 * 1024 * 1024 }, (error, stdout, stderr) => {
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
    const poToken = process.env.YT_PO_TOKEN;
    const visitorData = process.env.YT_VISITOR_DATA;
    if (poToken) {
      const val = visitorData ? `${poToken}~${visitorData}` : poToken;
      args.push('--extractor-args', `youtube:po_token=${val}`);
    }

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
    const poToken = process.env.YT_PO_TOKEN;
    const visitorData = process.env.YT_VISITOR_DATA;
    if (poToken) {
      const val = visitorData ? `${poToken}~${visitorData}` : poToken;
      args.push('--extractor-args', `youtube:po_token=${val}`);
    }

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
export function spawnYtDlpStream(url: string): Readable {
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
  const poToken = process.env.YT_PO_TOKEN;
  const visitorData = process.env.YT_VISITOR_DATA;
  if (poToken) {
    const val = visitorData ? `${poToken}~${visitorData}` : poToken;
    args.push('--extractor-args', `youtube:po_token=${val}`);
  }

  // Pass proxy if configured
  const proxy = process.env.YT_PROXY;
  if (proxy) {
    args.push('--proxy', proxy);
  }

  logger.info(`Spawning yt-dlp audio stream: "${url}"`);
  const child = spawn(YTDLP_PATH, args, {
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
