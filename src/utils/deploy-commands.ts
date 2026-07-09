import { REST, Routes } from 'discord.js';
import { config } from '../config/index.js';
import { commands } from '../commands/index.js';
import { logger } from './logger.js';

/**
 * Registers all Slash Commands to the Discord API for the configured client.
 */
export async function deploySlashCommands(): Promise<{ success: boolean; message: string }> {
  if (!config.isConfigured) {
    return {
      success: false,
      message: 'BOT_TOKEN hoặc CLIENT_ID chưa được cấu hình!',
    };
  }

  const slashCommandsJSON = commands.map((cmd) => cmd.data.toJSON());
  const rest = new REST({ version: '10' }).setToken(config.token);

  try {
    logger.info(`Starting slash commands registration... (Total commands: ${slashCommandsJSON.length})`);
    
    await rest.put(
      Routes.applicationCommands(config.clientId),
      { body: slashCommandsJSON }
    );

    const msg = `Đăng ký thành công ${slashCommandsJSON.length} slash commands với Discord API!`;
    logger.success(msg);
    return { success: true, message: msg };
  } catch (err: any) {
    const errorMsg = `Lỗi đăng ký slash commands: ${err.message || err}`;
    logger.error(errorMsg, err);
    return { success: false, message: errorMsg };
  }
}
