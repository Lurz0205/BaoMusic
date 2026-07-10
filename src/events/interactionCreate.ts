import { Client, Interaction } from 'discord.js';
import { commandsMap } from '../commands/index.js';
import { logger } from '../utils/logger.js';

export function registerInteractionCreateEvent(client: Client) {
  client.on('interactionCreate', async (interaction: Interaction) => {
    // 1. Slash Command Executions
    if (interaction.isChatInputCommand()) {
      const command = commandsMap.get(interaction.commandName);
      if (!command) {
        logger.warn(`No command found matching: ${interaction.commandName}`);
        return;
      }

      try {
        logger.info(`Executing command: /${interaction.commandName} by ${interaction.user.tag} in "${interaction.guild?.name || 'DM'}"`);
        if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ ephemeral: false });
        await command.execute(interaction).catch((e: any) => { throw e; });
      } catch (err: any) {
        logger.error(`Error executing command /${interaction.commandName}:`, err);
        
        const errorMessage = '❌ Có lỗi xảy ra khi thực hiện lệnh này!';
        
        try {
          if (interaction.replied || interaction.deferred) {
            await interaction.editReply({ content: errorMessage });
          } else {
            await interaction.reply({ content: errorMessage, ephemeral: true });
          }
        } catch (replyErr) {
          logger.error('Failed to reply to failed interaction:', replyErr);
        }
      }
    }
    
    // 2. Autocomplete Suggestions
    else if (interaction.isAutocomplete()) {
      const command = commandsMap.get(interaction.commandName) as any;
      if (!command || !command.autocomplete) return;

      try {
        await command.autocomplete(interaction);
      } catch (err: any) {
        // Log errors on autocomplete to assist debugging
        logger.error(`Autocomplete error for /${interaction.commandName}:`, err);
      }
    }
  });
}
