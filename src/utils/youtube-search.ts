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
 */
async function ensureYtDlp(): Promise<string> {
  const binDir = path.join(ROOT_DIR, 'bin');
  if (!fs.existsSync(binDir)) {
    fs.mkdirSync(binDir, { recursive: true });
  }

  // Nếu file chưa tồn tại, tải về
  if (!fs.existsSync(YTDLP_PATH)) {
    logger.info('Downloading yt-dlp binary (ELF linux)...');
    const url = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux';
    try {
      execSync(`curl -L ${url} -o "${YTDLP_PATH}"`, { stdio: 'inherit' });
      fs.chmodSync(YTDLP_PATH, 0o755);
    } catch (err) {
      logger.error('Failed to download yt-dlp:', err);
      throw new Error('Could not download yt-dlp. Please install it manually in ./bin/yt-dlp');
    }
  } else {
    // Đảm bảo quyền thực thi
    try {
      fs.chmodSync(YTDLP_PATH, 0o755);
    } catch (err) {
      // Ignored
    }
  }

  return YTDLP_PATH;
}

/**
 * Helper to build yt-dlp arguments with cookies and PO Token
 */
function buildYtDlpArgs(baseArgs: string[]): string[] {
  const args = [...baseArgs];

  if (config.hasCookies) {
    if (fs.existsSync(config.absoluteCookiePath)) {
      const stats = fs.statSync(config.absoluteCookiePath);
      logger.info(`Using cookies from ${config.absoluteCookiePath} (Size: ${stats.size} bytes)`);
      args.push('--cookies', config.absoluteCookiePath);
    } else {
      logger.warn(`Cookie path ${config.absoluteCookiePath} configured but file not found.`);
    }
  }

  const poToken = process.env.YT_PO_TOKEN;
  const visitorData = process.env.YT_VISITOR_DATA;

  // Common flags to bypass blocks
  const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
  args.push('--user-agent', userAgent);
  args.push('--force-ipv4');
  args.push('--no-check-certificates');
  args.push('--geo-bypass');
  args.push('--referer', 'https://www.youtube.com/');
  args.push('--add-header', 'Accept-Language:en-US,en;q=0.9');

  // Build extractor args
  // ios and android clients often have fewer bot checks
  const extractorArgs = [
    'youtube:player-client=ios,android,mweb',
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
  
  logger.info(`Spawning yt-dlp with arguments: ${args.join(' ')}`);

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
  // Try play-dl first (much more reliable for full search)
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

  // Fallback to youtube-sr
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

  // Fallback to yt-dlp search if others fail
  try {
    const baseArgs = [
      `ytsearch${limit}:${query}`,
      '--flat-playlist',
      '--dump-json',
      '--js-runtimes', 'node'
    ];

    const args = buildYtDlpArgs(baseArgs);
    
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
 * Falls back to yt-dlp if play-dl fails or if it's a non-YouTube URL.
 */
export async function ytDlpGetMetadata(url: string): Promise<YouTubeSearchResult[]> {
  // Try play-dl first for YouTube URLs
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

  // Fallback to yt-dlp
  try {
    const baseArgs = [
      url,
      '--flat-playlist',
      '--dump-json',
      '--js-runtimes', 'node'
    ];

    const args = buildYtDlpArgs(baseArgs);
    
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
  if (url.includes('youtube.com') || url.includes('youtu.be')) {
    try {
      logger.info(`Attempting play-dl stream for YouTube URL: ${url}`);
      
      // Try to use po_token if available in environment
      const poToken = process.env.YT_PO_TOKEN;
      const visitorData = process.env.YT_VISITOR_DATA;
      
      const streamOptions: any = {
        quality: 2,
        discordPlayerCompatibility: true,
        // play-dl allows passing custom cookies and useragent via its global setToken,
        // but we can also try to ensure it uses the best possible headers.
      };
      
      const stream = await play.stream(url, streamOptions);
      logger.success(`Successfully started play-dl stream for: ${url}`);
      return stream.stream;
    } catch (err: any) {
      logger.warn(`play-dl stream failed, falling back to yt-dlp: ${err.message || err}`);
    }
  }

  return spawnYtDlpStream(url);
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
