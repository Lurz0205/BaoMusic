import { config } from '../config/index.js';
import fs from 'fs';
import { logger } from './logger.js';
import { Readable } from 'stream';
import play from 'play-dl';
import { YouTube } from 'youtube-sr';
import youtubedl from 'youtube-dl-exec';

export interface YouTubeSearchResult {
  id: string;
  title: string;
  url: string;
  thumbnail: string;
  duration: number; // in seconds
  durationString: string;
}

function getYtDlpOptions(extraOptions: Record<string, any> = {}) {
  const baseOptions: any = {
    noCheckCertificates: true,
    noWarnings: true,
    retries: 3,
    fragmentRetries: 3,
    jsRuntimes: `node:${process.execPath}`,
    addHeader: [
      'referer:youtube.com',
      'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ],
    ...extraOptions
  };

  const poToken = process.env.YT_PO_TOKEN;
  if (poToken) {
    const formattedPoToken = poToken.startsWith('web+') ? poToken : `web+${poToken}`;
    baseOptions.extractorArgs = `youtube:po_token=${formattedPoToken};player_client=web`;
    const visitorData = process.env.YT_VISITOR_DATA;
    if (visitorData) {
       baseOptions.extractorArgs += `;visitor_data=${visitorData}`;
    }
  } else if (config.hasCookies) {
    const resolvedPath = config.absoluteCookiePath;
    if (fs.existsSync(resolvedPath)) {
      baseOptions.cookies = resolvedPath;
    }
  } else {
    // Auth yapılandırılmamışsa iOS client kullan.
    // Bu, VPS/sunucu IP'lerinde YouTube'un bot tespitini cookie veya token gerektirmeden atlar.
    baseOptions.extractorArgs = 'youtube:player_client=ios';
  }

  const proxy = process.env.YT_PROXY;
  if (proxy) baseOptions.proxy = proxy;

  return baseOptions;
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
 * Searches for YouTube videos and returns a list of results.
 * Uses play-dl primarily for speed, falls back to yt-dlp if needed.
 */
export async function searchYouTube(query: string, limit: number = 5, platform: string = 'youtube'): Promise<YouTubeSearchResult[]> {
  // 1. Try yt-dlp first (most reliable for search results when cookies are involved)
  try {
    const searchPrefix = platform === 'soundcloud' ? `scsearch${limit}:` : `ytsearch${limit}:`;
    
    const results = await youtubedl(searchPrefix + query, getYtDlpOptions({
      dumpSingleJson: true,
      flatPlaylist: true,
    }));
    
    if (results && (results as any).entries) {
      const items = (results as any).entries.slice(0, limit);
      const formattedResults: YouTubeSearchResult[] = [];
      
      for (const item of items) {
        if (!item) continue;
        const id = item.id || '';
        formattedResults.push({
          id,
          title: item.title || item.fulltitle || 'Unknown Title',
          url: item.webpage_url || item.url || (id ? `https://www.youtube.com/watch?v=${id}` : ''),
          thumbnail: item.thumbnails?.[0]?.url || item.thumbnail || '',
          duration: item.duration || 0,
          durationString: item.duration_string || formatDuration(item.duration || 0)
        });
      }
      
      if (formattedResults.length > 0) return formattedResults;
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
    const results = await youtubedl(url, getYtDlpOptions({
      dumpSingleJson: true,
      flatPlaylist: true,
    }));

    if (results) {
      const items = (results as any).entries ? (results as any).entries : [results];
      const formattedResults: YouTubeSearchResult[] = [];
      
      for (const item of items) {
        if (!item) continue;
        const id = item.id || '';
        formattedResults.push({
          id,
          title: item.title || item.fulltitle || 'Unknown Title',
          url: item.webpage_url || item.url || (id ? `https://www.youtube.com/watch?v=${id}` : url),
          thumbnail: item.thumbnails?.[0]?.url || item.thumbnail || '',
          duration: item.duration || 0,
          durationString: item.duration_string || formatDuration(item.duration || 0)
        });
      }
      if (formattedResults.length > 0) return formattedResults;
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
  logger.info(`Spawning yt-dlp audio stream: "${url}"`);
  
  const options = getYtDlpOptions({
    f: 'bestaudio',
    noPlaylist: true,
    bufferSize: '16K',
    o: '-'
  });

  const child = youtubedl.exec(url, options as any, {
    stdio: ['ignore', 'pipe', 'pipe']
  });

  if (!child.stdout) {
    throw new Error('Failed to create stdout for yt-dlp child process');
  }

  if (child.stderr) {
    child.stderr.on('data', (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) {
        logger.warn(`[yt-dlp stream stderr]: ${msg}`);
      }
    });
  }

  child.on('error', (err: Error) => {
    logger.error(`yt-dlp stream process failed to spawn for "${url}":`, err);
  });

  child.on('exit', (code: number | null, signal: string | null) => {
    if (code !== 0 && code !== null) {
      logger.warn(`yt-dlp stream process exited with code ${code}, signal: ${signal}`);
    } else {
      logger.info(`yt-dlp stream process completed successfully.`);
    }
  });

  return child.stdout as Readable;
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
