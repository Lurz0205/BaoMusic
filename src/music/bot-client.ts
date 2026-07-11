import { Client, GatewayIntentBits } from 'discord.js';
import { config } from '../config/index.js';
import { registerAllEvents } from '../events/index.js';
import { logger } from '../utils/logger.js';
import { BotStatus } from '../types.js';
import { playerManager } from './PlayerManager.js';

let clientInstance: Client | null = null;
let botStartTime = 0;

/**
 * Get active Discord Client instance
 */
export function getBotClient(): Client | null {
  return clientInstance;
}

/**
 * Starts the Discord Bot client.
 */
export async function startBot(): Promise<boolean> {
  if (clientInstance) {
    logger.warn('Discord Bot client is already running!');
    return true;
  }

  if (!config.isConfigured) {
    logger.warn('Bot token or Client ID is missing. Discord Bot will not start automatically.');
    return false;
  }

  try {
    logger.info('Initializing Discord Bot Client...');
    
    const client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
      ],
    });

    // Register event listeners
    registerAllEvents(client);

    logger.info('Logging in to Discord...');
    await client.login(config.token);
    
    clientInstance = client;
    botStartTime = Math.floor(Date.now() / 1000);
    logger.success('Discord Bot client successfully connected and running!');
    return true;
  } catch (err: any) {
    logger.error('Failed to login or start the Discord Bot client:', err);
    clientInstance = null;
    return false;
  }
}

/**
 * Stop the Discord Bot client.
 */
export async function stopBot(): Promise<void> {
  if (clientInstance) {
    logger.info('Stopping Discord Bot Client...');
    try {
      clientInstance.destroy();
    } catch (err) {
      logger.error('Error destroying bot client:', err);
    }
    clientInstance = null;
    botStartTime = 0;
    logger.info('Discord Bot Client stopped.');
  }
}

/**
 * Returns current status of the bot for the API and dashboard.
 */
export function getBotStatus(): BotStatus {
  const isOnline = clientInstance !== null && clientInstance.readyAt !== null;
  
  return {
    online: isOnline,
    username: clientInstance?.user?.username || null,
    avatarUrl: clientInstance?.user?.displayAvatarURL() || null,
    latency: clientInstance ? clientInstance.ws.ping : -1,
    guildsCount: clientInstance?.guilds.cache.size || 0,
    uptime: botStartTime > 0 ? Math.floor(Date.now() / 1000) - botStartTime : 0,
    activePlayersCount: playerManager.activeCount,
    hasCookies: config.hasCookies,
    isConfigured: config.isConfigured,
  };
}
