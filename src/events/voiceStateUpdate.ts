import { Client, VoiceState } from 'discord.js';
import { playerManager } from '../music/PlayerManager.js';
import { logger } from '../utils/logger.js';

export function registerVoiceStateUpdateEvent(client: Client) {
  client.on('voiceStateUpdate', (oldState: VoiceState, newState: VoiceState) => {
    const guildId = oldState.guild.id;
    const queue = playerManager.get(guildId);
    if (!queue) return;

    const botId = client.user?.id;
    if (!botId) return;

    // Case 1: Bot got disconnected from voice channel by someone else
    if (oldState.member?.id === botId && oldState.channelId && !newState.channelId) {
      logger.music(`Bot disconnected from voice channel "${oldState.channel?.name}" by admin. Cleaning up queue.`, 'disconnected');
      playerManager.delete(guildId);
      return;
    }

    // Case 2: Bot is alone in the voice channel (all members left)
    const voiceChannel = queue.voiceChannelId 
      ? oldState.guild.channels.cache.get(queue.voiceChannelId) 
      : null;

    if (voiceChannel && voiceChannel.isVoiceBased()) {
      // Filter non-bot members
      const humanMembers = voiceChannel.members.filter((m) => !m.user.bot);
      
      if (humanMembers.size === 0 && !queue.is247) {
        logger.music(`Voice channel "${voiceChannel.name}" is empty of human users. Leaving in 30 seconds to save bandwidth.`, 'idle');
        
        // Start rapid leave timer for empty channel (30s)
        setTimeout(() => {
          const updatedChannel = oldState.guild.channels.cache.get(queue.voiceChannelId);
          if (updatedChannel && updatedChannel.isVoiceBased()) {
            const currentHumans = updatedChannel.members.filter((m) => !m.user.bot);
            if (currentHumans.size === 0 && !queue.is247 && playerManager.has(guildId)) {
              logger.music(`Leaving voice channel "${updatedChannel.name}" due to emptiness.`, 'empty_leave');
              playerManager.delete(guildId);
            }
          }
        }, 30_000);
      }
    }
  });
}
