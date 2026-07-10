import { Client, Interaction } from 'discord.js';
import { commandsMap } from '../commands/index.js';
import { logger } from '../utils/logger.js';
import { playerManager } from '../music/PlayerManager.js';

export function registerInteractionCreateEvent(client: Client) {
  client.on('interactionCreate', async (interaction: Interaction) => {
    // 1. Button interactions
    if (interaction.isButton()) {
      const queue = playerManager.get(interaction.guildId || '');
      if (!queue) return interaction.reply({ content: '❌ Không có hàng đợi nhạc!', ephemeral: true });

      switch (interaction.customId) {
        case 'control_skip':
          queue.skip();
          await interaction.deferUpdate();
          break;
        case 'control_pause_resume':
          if (queue.player.state.status === 'playing') queue.pause();
          else queue.resume();
          await interaction.deferUpdate();
          break;
        case 'control_previous':
          queue.previous();
          await interaction.deferUpdate();
          break;
        case 'control_volume_up':
          queue.setVolume(Math.min(queue.volume + 10, 100));
          await interaction.deferUpdate();
          break;
        case 'control_volume_down':
          queue.setVolume(Math.max(queue.volume - 10, 0));
          await interaction.deferUpdate();
          break;
        case 'control_loop':
          // Need to add loop implementation in GuildQueue if not exists
          await interaction.reply({ content: '🔁 Tính năng này đang được phát triển!', ephemeral: true });
          break;
      }
      return;
    }

    // 2. Slash Command Executions
    if (interaction.isChatInputCommand()) {
      const command = commandsMap.get(interaction.commandName);
      if (!command) {
        logger.warn(`No command found matching: ${interaction.commandName}`);
        return;
      }

      try {
        logger.info(`Executing command: /${interaction.commandName} by ${interaction.user.tag} in "${interaction.guild?.name || 'DM'}"`);
        if (!interaction.deferred && !interaction.replied) {
          try {
            await interaction.deferReply({ ephemeral: false });
          } catch (e) {
            logger.error('Failed to defer interaction:', e);
            throw e;
          }
        }
        const wrappedInteraction = Object.create(interaction);
        wrappedInteraction.reply = async (options: any) => {
          if (interaction.deferred || interaction.replied) {
            return interaction.editReply(options);
          }
          return interaction.reply(options);
        };
        await command.execute(wrappedInteraction).catch((e: any) => { throw e; });
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
