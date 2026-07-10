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
        case 'control_loop': {
          const modes: ('off' | 'track' | 'queue')[] = ['off', 'track', 'queue'];
          const currentIndex = modes.indexOf(queue.loopMode);
          const nextIndex = (currentIndex + 1) % modes.length;
          queue.loopMode = modes[nextIndex];
          
          let modeViet = '';
          if (queue.loopMode === 'off') modeViet = 'Tắt lặp';
          if (queue.loopMode === 'track') modeViet = 'Lặp 1 bài (Track)';
          if (queue.loopMode === 'queue') modeViet = 'Lặp cả hàng chờ (Queue)';

          await interaction.reply({
            content: `🔄 Đã chuyển chế độ lặp sang: **${modeViet}**!`,
            ephemeral: true
          });
          break;
        }
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
        // Defer as quickly as possible to avoid 3s timeout
        const safeDefer = async () => {
          if (!interaction.deferred && !interaction.replied) {
            try {
              await interaction.deferReply({ ephemeral: false });
            } catch (deferErr: any) {
              logger.warn(`Failed to defer interaction for /${interaction.commandName}: ${deferErr.message}`);
            }
          }
        };

        await safeDefer();

        logger.info(`Executing command: /${interaction.commandName} by ${interaction.user.tag} in "${interaction.guild?.name || 'DM'}"`);

        // Monkey-patch response methods to be state-aware and robust
        const originalReply = interaction.reply.bind(interaction);
        const originalEditReply = interaction.editReply.bind(interaction);

        const wrappedInteraction = interaction as any;
        
        // Track response state manually to avoid race conditions with Discord.js internal state
        let hasResponded = interaction.replied || interaction.deferred;

        wrappedInteraction.reply = async (options: any) => {
          if (hasResponded) {
            try {
              return await originalEditReply(options);
            } catch (err: any) {
              if (err.code === 10062 || err.code === 40060) return;
              throw err;
            }
          }
          try {
            const res = await originalReply(options);
            hasResponded = true;
            return res;
          } catch (err: any) {
            if (err.code === 40060 || (err.message && err.message.includes('already been acknowledged'))) {
              hasResponded = true;
              try { return await originalEditReply(options); } catch { return; }
            }
            if (err.code === 10062) return;
            throw err;
          }
        };

        wrappedInteraction.editReply = async (options: any) => {
          if (!hasResponded) {
            try {
              const res = await originalReply(options);
              hasResponded = true;
              return res;
            } catch (err: any) {
              if (err.code === 40060 || (err.message && err.message.includes('already been acknowledged'))) {
                hasResponded = true;
                try { return await originalEditReply(options); } catch { return; }
              }
              if (err.code === 10062) return;
              throw err;
            }
          }
          try {
            return await originalEditReply(options);
          } catch (err: any) {
            if (err.code === 10062) return;
            // Handle InteractionNotReplied specifically
            if (err.code === 'InteractionNotReplied' || (err.message && err.message.includes('not been sent or deferred'))) {
              try { 
                const res = await originalReply(options); 
                hasResponded = true;
                return res;
              } catch { return; }
            }
            throw err;
          }
        };

        await command.execute(wrappedInteraction);
      } catch (err: any) {
        // Handle Unknown Interaction (10062) gracefully
        if (err.code === 10062) {
          logger.warn(`Command /${interaction.commandName} failed with Unknown Interaction (likely timed out)`);
          return;
        }

        logger.error(`Error executing command /${interaction.commandName}:`, err);
        
        const errorMessage = '❌ Có lỗi xảy ra khi thực hiện lệnh này!';
        
        try {
          if (interaction.replied || interaction.deferred) {
            await interaction.editReply({ content: errorMessage });
          } else {
            await interaction.reply({ content: errorMessage, ephemeral: true });
          }
        } catch (replyErr: any) {
          if (replyErr.code !== 10062 && replyErr.code !== 40060) {
            logger.error('Failed to reply to failed interaction:', replyErr);
          }
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
