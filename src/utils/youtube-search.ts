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
 * Luôn tải bản mới nhất để tránh lỗi bot detection.
 */
async function ensureYtDlp(): Promise<string> {
  const binDir = path.join(ROOT_DIR, 'bin');
  if (!fs.existsSync(binDir)) {
    fs.mkdirSync(binDir, { recursive: true });
  }

  const stats = fs.existsSync(YTDLP_PATH) ? fs.statSync(YTDLP_PATH) : null;
  // Kiểm tra nếu binary quá cũ (6 giờ) thì tải mới để đảm bảo có bản vá mới nhất từ cộng đồng
  const shouldDownload = !stats || (Date.now() - stats.mtimeMs > 6 * 60 * 60 * 1000);
  
  if (shouldDownload) {
    logger.info('Updating yt-dlp binary to the latest version...');
    const url = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux';
    try {
      execSync(`curl -L ${url} -o "${YTDLP_PATH}"`, { stdio: 'inherit' });
      fs.chmodSync(YTDLP_PATH, 0o755);
      // Run internal update just in case the release was a few hours old
      execSync(`"${YTDLP_PATH}" -U`, { stdio: 'ignore' });
    } catch (err) {
      logger.error('Failed to update yt-dlp:', err);
      if (!fs.existsSync(YTDLP_PATH)) {
        throw new Error('Could not download yt-dlp binary.');
      }
    }
  }

  return YTDLP_PATH;
}

/**
 * Helper to build yt-dlp arguments with cookies and optimized headers
 */
function buildYtDlpArgs(baseArgs: string[]): string[] {
  const args = [...baseArgs];

  // Use a modern User-Agent
  const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  args.push('--user-agent', userAgent);
  args.push('--force-ipv4');
  args.push('--no-check-certificates');
  args.push('--geo-bypass');
  args.push('--referer', 'https://www.youtube.com/');
  args.push('--no-cache-dir');
  
  let extractorArgsStr = 'youtube:player_client=ios';

  const poToken = process.env.YT_PO_TOKEN;
  if (poToken) {
    const formattedPoToken = poToken.startsWith('web+') ? poToken : `web+${poToken}`;
    extractorArgsStr = `youtube:po_token=${formattedPoToken};player_client=web`;
    const visitorData = process.env.YT_VISITOR_DATA;
    if (visitorData) {
       extractorArgsStr += `;visitor_data=${visitorData}`;
    }
  } else if (config.hasCookies) {
    const resolvedPath = config.absoluteCookiePath;
    if (fs.existsSync(resolvedPath)) {
      args.push('--cookies', resolvedPath);
      // Wait, if it has cookies, should we use web or ios? User snippet says:
      // else if (config.ytdl.cookiesFile) { baseOptions.cookies = config.ytdl.cookiesFile; }
      // does not set player_client explicitly in if blocks but let's keep it to default or web?
      // Wait, snippet says:
      // if (poToken) -> player_client=web
      // else if (browserCookies) -> ...
      // else if (cookiesFile) -> ...
      // else -> player_client=ios
      // So if cookiesFile exists without PO Token, they didn't set extractorArgs (so it uses default).
      extractorArgsStr = ''; // Let yt-dlp decide if cookies are provided
    }
  }
  
  if (extractorArgsStr) {
    args.push('--extractor-args', extractorArgsStr);
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

/**
 * Runs the yt-dlp binary with specific arguments and returns stdout.
 */
export async function runYtDlp(args: string[]): Promise<string> {
  const binaryPath = await ensureYtDlp();
  return new Promise((resolve, reject) => {
    // Only log essential info to avoid clutter
    const debugArgs = args.filter(a => !a.includes('cookie') && !a.includes('token'));
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

/**
 * Searches for YouTube videos and returns a list of results.
 * Uses play-dl primarily for speed, falls back to yt-dlp if needed.
 */
export async function searchYouTube(query: string, limit: number = 5, platform: string = 'youtube'): Promise<YouTubeSearchResult[]> {
  // 1. Try yt-dlp first (most reliable for search results when cookies are involved)
  try {
    const searchPrefix = platform === 'soundcloud' ? `scsearch${limit}:` : `ytsearch${limit}:`;
    const baseArgs = [
      `${searchPrefix}${query}`,
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
    let sourceOpt: any = { youtube: 'video' };
    if (platform === 'soundcloud') {
      sourceOpt = { soundcloud: 'tracks' };
    } else if (platform === 'spotify') {
      sourceOpt = { spotify: 'track' };
    }
    
    const playResults = await play.search(query, { limit, source: sourceOpt });
    if (playResults && playResults.length > 0) {
      return playResults.map(v => {
        let durationInSec = 0;
        let durationRaw = '';
        if ('durationInSec' in v) {
          durationInSec = (v as any).durationInSec;
          durationRaw = (v as any).durationRaw || formatDuration(durationInSec);
        }
        
        return {
          id: String(v.id || ''),
          title: v.title || 'Unknown Title',
          url: v.url,
          thumbnail: (v as any).thumbnails?.[0]?.url || (v as any).thumbnail?.url || '',
          duration: durationInSec,
          durationString: durationRaw
        };
      });
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
  try {
    const type = await play.validate(url);
    if (type === 'yt_video' || type === 'so_track' || type === 'sp_track') {
      let info: any;
      if (type === 'yt_video') info = (await play.video_basic_info(url)).video_details;
      else if (type === 'so_track') info = await play.soundcloud(url);
      else if (type === 'sp_track') info = await play.spotify(url);
      
      const v = info;
      return [{
        id: String(v.id || ''),
        title: v.name || v.title || 'Unknown Title',
        url: v.url,
        thumbnail: v.thumbnails?.[0]?.url || v.thumbnail?.url || '',
        duration: v.durationInSec || 0,
        durationString: v.durationRaw || formatDuration(v.durationInSec || 0)
      }];
    } else if (type === 'yt_playlist' || type === 'so_playlist' || type === 'sp_playlist' || type === 'sp_album') {
      let items: any[] = [];
      if (type === 'yt_playlist') items = await (await play.playlist_info(url, { incomplete: true })).all_videos();
      else if (type === 'so_playlist') items = await (await play.soundcloud(url) as any).all_tracks();
      else items = await (await play.spotify(url) as any).all_tracks();
      
      return items.map(v => ({
        id: String(v.id || ''),
        title: v.name || v.title || 'Unknown Title',
        url: v.url,
        thumbnail: v.thumbnails?.[0]?.url || v.thumbnail?.url || '',
        duration: v.durationInSec || 0,
        durationString: v.durationRaw || formatDuration(v.durationInSec || 0)
      }));
    }
  } catch (err: any) {
    logger.warn(`play-dl metadata fetch failed: ${err.message || err}`);
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
  if (url.includes('soundcloud.com') || url.includes('spotify.com')) {
    try {
      logger.info(`Attempting play-dl stream for non-YouTube URL: ${url}`);
      const stream = await play.stream(url, { discordPlayerCompatibility: true });
      return stream.stream;
    } catch (err: any) {
      logger.warn(`play-dl stream failed for ${url}, falling back to yt-dlp: ${err.message || err}`);
    }
  }

  // Use yt-dlp for all YouTube streams or as fallback for others
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
