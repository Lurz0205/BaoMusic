import { Client, ActivityType } from 'discord.js';
import { logger } from '../utils/logger.js';

export function registerReadyEvent(client: Client) {
  client.once('clientReady', (readyClient) => {
    logger.success(`Bot is online! Logged in as ${readyClient.user.tag}`, 'ready');
    
    // Set custom activity presence
    try {
      readyClient.user.setPresence({
        activities: [{ name: '/play | /help 🎵', type: ActivityType.Listening }],
        status: 'online',
      });
    } catch (err) {
      logger.error('Failed to set bot presence:', err);
    }
  });
}
