import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { logger } from '../utils/logger.js';

// Load environment variables
dotenv.config();

const ROOT_DIR = process.cwd();

// Decode Client ID from Discord Bot Token
function getClientIdFromToken(token: string): string {
  try {
    const parts = token.trim().split('.');
    if (parts.length > 0) {
      const decoded = Buffer.from(parts[0], 'base64').toString('utf-8');
      if (/^\d{17,21}$/.test(decoded)) {
        return decoded;
      }
    }
  } catch (err) {
    logger.error('Failed to parse client ID from token:', err);
  }
  return '';
}

const rawToken = process.env.BOT_TOKEN || '';
let resolvedClientId = process.env.CLIENT_ID || '';

if (rawToken) {
  const extractedId = getClientIdFromToken(rawToken);
  if (extractedId) {
    if (resolvedClientId && resolvedClientId !== extractedId) {
      logger.warn(`CLIENT_ID mismatch detected! Environment CLIENT_ID is ${resolvedClientId}, but BOT_TOKEN belongs to application ${extractedId}. Automatically correcting to ${extractedId} to prevent Discord Error 10002 (Unknown Application).`);
    }
    resolvedClientId = extractedId;
  }
}

export const config = {
  token: rawToken,
  clientId: resolvedClientId,
  port: parseInt(process.env.PORT || '3000', 10),
  cookiePath: process.env.COOKIE_PATH || path.join(ROOT_DIR, 'cookies', 'cookie.txt'),
  
  // Helper to check if credentials are valid
  get isConfigured(): boolean {
    return this.token.length > 0 && this.clientId.length > 0;
  },
  
  // Helper to check if cookies file exists
  get hasCookies(): boolean {
    try {
      const resolvedPath = path.isAbsolute(this.cookiePath) 
        ? this.cookiePath 
        : path.join(ROOT_DIR, this.cookiePath);
        
      return fs.existsSync(resolvedPath);
    } catch {
      return false;
    }
  },

  // Get resolved absolute cookies path
  get absoluteCookiePath(): string {
    return path.isAbsolute(this.cookiePath)
      ? this.cookiePath
      : path.join(ROOT_DIR, this.cookiePath);
  }
};

logger.info(`Configuration Loaded. Configured: ${config.isConfigured}, Has Cookies: ${config.hasCookies}, Resolved Client ID: ${config.clientId}`);
