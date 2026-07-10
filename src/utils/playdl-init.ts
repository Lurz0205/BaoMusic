import play from 'play-dl';
import fs from 'fs';
import { config } from '../config/index.js';
import { logger } from './logger.js';

export interface CookieObject {
  domain: string;
  path: string;
  secure: boolean;
  expirationDate?: number;
  expires?: number;
  name: string;
  value: string;
}

export function parseNetscapeCookies(raw: string): CookieObject[] {
  const content = raw.trim();
  if (!content) return [];
  
  const cookies: CookieObject[] = [];
  const lines = content.split(/\r?\n/);
  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith('#')) continue;
    const parts = line.split('\t');
    if (parts.length >= 7) {
      const domain = parts[0].trim();
      const path = parts[2].trim();
      const secure = parts[3].trim().toUpperCase() === 'TRUE';
      const expirationDate = parseInt(parts[4].trim(), 10);
      const name = parts[5].trim();
      const value = parts[6].trim();
      
      const cleanName = name.replace(/[\x00-\x1F\x7F-\x9F]/g, '');
      const cleanValue = value.replace(/[\x00-\x1F\x7F-\x9F]/g, '');
      
      if (cleanName && cleanValue) {
        cookies.push({
          domain,
          path,
          secure,
          expirationDate: isNaN(expirationDate) ? undefined : expirationDate,
          expires: isNaN(expirationDate) ? undefined : expirationDate,
          name: cleanName,
          value: cleanValue
        });
      }
    }
  }
  return cookies;
}

export function parseCookies(raw: string): CookieObject[] {
  const content = raw.trim();
  if (!content) return [];
  
  if (content.startsWith('[') && content.endsWith(']')) {
    try {
      return JSON.parse(content);
    } catch {
      // Fallback to Netscape
    }
  }
  
  return parseNetscapeCookies(raw);
}

export function cleanAndFormatCookie(raw: string): string {
  const content = raw.trim();
  if (!content) return '';
  
  // Check if Netscape format (tab-separated, comments, etc.)
  if (content.includes('\t') || content.startsWith('#')) {
    const lines = content.split(/\r?\n/);
    const pairs: string[] = [];
    for (let line of lines) {
      line = line.trim();
      if (!line || line.startsWith('#')) continue;
      const parts = line.split('\t');
      if (parts.length >= 7) {
        const name = parts[5].trim();
        const value = parts[6].trim();
        // Remove any control characters or invalid bytes (header values must not contain control chars)
        const cleanName = name.replace(/[\x00-\x1F\x7F-\x9F]/g, '');
        const cleanValue = value.replace(/[\x00-\x1F\x7F-\x9F]/g, '');
        if (cleanName && cleanValue) {
          pairs.push(`${cleanName}=${cleanValue}`);
        }
      }
    }
    return pairs.join('; ');
  }
  
  // If already semicolon-separated, strip any invalid control characters
  return content.replace(/[\x00-\x1F\x7F-\x9F]/g, '');
}

export async function initPlayDL() {
  try {
    if (config.hasCookies) {
      const cookiePath = config.absoluteCookiePath;
      const cookieData = fs.readFileSync(cookiePath, 'utf8');
      const cleanedCookie = cleanAndFormatCookie(cookieData);
      
      if (cleanedCookie) {
        // play-dl setToken accepts cookie as a string or an object
        await play.setToken({
          youtube: {
            cookie: cleanedCookie
          }
        });
        logger.success('Play-DL initialized successfully with custom youtube cookies.');
      } else {
        logger.warn('Cookie file is empty or could not be parsed. Play-DL starting without cookies.');
      }
    } else {
      logger.info('No cookie file found. Play-DL will operate without cookies.');
    }
  } catch (err: any) {
    logger.error('Failed to initialize Play-DL with custom cookies:', err);
  }
}
