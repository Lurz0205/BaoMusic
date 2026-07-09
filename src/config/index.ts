import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { logger } from '../utils/logger.js';

// Load environment variables
dotenv.config();

const ROOT_DIR = process.cwd();

export const config = {
  token: process.env.BOT_TOKEN || '',
  clientId: process.env.CLIENT_ID || '',
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

logger.info(`Configuration Loaded. Configured: ${config.isConfigured}, Has Cookies: ${config.hasCookies}`);
