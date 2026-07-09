import { ChatInputCommandInteraction, GuildMember, SlashCommandBuilder } from 'discord.js';
import { joinVoiceChannel } from '@discordjs/voice';
import { playerManager } from '../music/PlayerManager.js';
import { logger } from '../utils/logger.js';

export const joinCommand = {
  data: new SlashCommandBuilder()
    .setName('join')
    .setDescription('Mời bot tham gia vào kênh thoại (voice channel) của bạn.'),

  async execute(interaction: ChatInputCommandInteraction) {
    const member = interaction.member as GuildMember;
    const voiceChannel = member?.voice?.channel;

    if (!voiceChannel) {
      return interaction.reply({
        content: '❌ Bạn phải ở trong một kênh thoại (voice channel) để sử dụng lệnh này!',
        ephemeral: true,
      });
    }

    const botMember = interaction.guild?.members.me;
    
    // Check voice permissions
    if (botMember && !voiceChannel.permissionsFor(botMember).has(['Connect', 'Speak'])) {
      return interaction.reply({
        content: '❌ Bot không có quyền truy cập (`Connect`) hoặc quyền nói (`Speak`) trong kênh thoại của bạn!',
        ephemeral: true,
      });
    }

    try {
      // Connect to voice channel
      const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: voiceChannel.guild.id,
        adapterCreator: voiceChannel.guild.voiceAdapterCreator,
        selfDeaf: true,
        selfMute: false,
      });

      // Register or update GuildQueue in PlayerManager
      const existingQueue = playerManager.get(voiceChannel.guild.id);
      if (!existingQueue) {
        playerManager.create(
          voiceChannel.guild.id,
          voiceChannel.guild.name,
          connection,
          voiceChannel.id,
          voiceChannel.name,
          interaction.channelId || undefined
        );
      } else {
        // Just update connection if already exists
        existingQueue.connection = connection;
        existingQueue.voiceChannelId = voiceChannel.id;
        existingQueue.channelName = voiceChannel.name;
        connection.subscribe(existingQueue.player);
      }

      await interaction.reply({
        content: `✅ Đã kết nối thành công vào kênh thoại: **${voiceChannel.name}**!`,
      });
    } catch (err: any) {
      logger.error('Error executing /join:', err);
      await interaction.reply({
        content: `❌ Gặp sự cố khi cố gắng tham gia kênh thoại: ${err.message}`,
        ephemeral: true,
      });
    }
  }
};
