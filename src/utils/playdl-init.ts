import play from 'play-dl';
import fs from 'fs';
import { config } from '../config/index.js';
import { logger } from './logger.js';

export async function initPlayDL() {
  try {
    if (config.hasCookies) {
      const cookiePath = config.absoluteCookiePath;
      const cookieData = fs.readFileSync(cookiePath, 'utf8').trim();
      
      if (cookieData) {
        // play-dl setToken accepts cookie as a string or an object
        await play.setToken({
          youtube: {
            cookie: cookieData
          }
        });
        logger.success('Play-DL initialized successfully with custom youtube cookies.');
      } else {
        logger.warn('Cookie file is empty. Play-DL starting without cookies.');
      }
    } else {
      logger.info('No cookie file found. Play-DL will operate without cookies.');
    }
  } catch (err: any) {
    logger.error('Failed to initialize Play-DL with custom cookies:', err);
  }
}
