import { config } from '../config/index.js';
import fs from 'fs';
import { cleanAndFormatCookie } from './playdl-init.js';
import { logger } from './logger.js';

export interface YouTubeSearchResult {
  id: string;
  title: string;
  url: string;
  thumbnail: string;
  duration: number; // in seconds
  durationString: string;
}

function findVideoRenderers(obj: any, results: any[] = []): any[] {
  if (!obj || typeof obj !== 'object') return results;
  
  if (obj.videoRenderer) {
    results.push(obj.videoRenderer);
  }
  
  // To avoid circular references (though rare in native parsed JSON),
  // and handle standard JSON structures
  for (const key of Object.keys(obj)) {
    try {
      findVideoRenderers(obj[key], results);
    } catch {
      // safe fallback
    }
  }
  
  return results;
}

function parseDuration(durationStr: string): number {
  if (!durationStr) return 0;
  const parts = durationStr.split(':').map(Number);
  let seconds = 0;
  if (parts.length === 2) {
    seconds = parts[0] * 60 + parts[1];
  } else if (parts.length === 3) {
    seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return isNaN(seconds) ? 0 : seconds;
}

export async function searchYouTube(query: string, limit: number = 5): Promise<YouTubeSearchResult[]> {
  try {
    const cookiePath = config.absoluteCookiePath;
    let cookieHeader = '';
    
    if (fs.existsSync(cookiePath)) {
      try {
        const cookieData = fs.readFileSync(cookiePath, 'utf8');
        cookieHeader = cleanAndFormatCookie(cookieData);
      } catch (err) {
        logger.error('Failed to read/format cookies for searchYouTube:', err);
      }
    }

    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&hl=en`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        ...(cookieHeader ? { 'Cookie': cookieHeader } : {})
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const html = await response.text();
    
    // Attempt to extract the initial data JSON
    const match = html.match(/ytInitialData\s*=\s*({.+?});/s) || 
                  html.match(/ytInitialData\s*=\s*({.+?})\s*<\/script>/s) ||
                  html.match(/window\["ytInitialData"\]\s*=\s*({.+?});/s);
                  
    if (!match) {
      throw new Error('Could not find ytInitialData in search results HTML.');
    }

    let ytInitialData: any = null;
    try {
      ytInitialData = JSON.parse(match[1]);
    } catch (parseErr: any) {
      throw new Error(`Failed to parse ytInitialData JSON: ${parseErr.message}`);
    }

    const renderers = findVideoRenderers(ytInitialData);
    const results: YouTubeSearchResult[] = [];
    
    for (const videoRenderer of renderers) {
      if (results.length >= limit) break;
      
      const videoId = videoRenderer.videoId;
      if (!videoId) continue;
      
      const title = videoRenderer.title?.runs?.[0]?.text || videoRenderer.title?.simpleText || 'Unknown Title';
      const thumbnail = videoRenderer.thumbnail?.thumbnails?.[0]?.url || '';
      const durationString = videoRenderer.lengthText?.simpleText || '0:00';
      const duration = parseDuration(durationString);
      
      results.push({
        id: videoId,
        title,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        thumbnail,
        duration,
        durationString
      });
    }

    return results;
  } catch (err: any) {
    logger.error(`searchYouTube failed for query "${query}":`, err.message || err);
    return [];
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
      duration: r.duration * 1000, // youtube-sr uses milliseconds
      durationFormatted: r.durationString
    }));
  },
  
  async searchOne(query: string) {
    const results = await this.search(query, { limit: 1 });
    return results.length > 0 ? results[0] : null;
  }
};

