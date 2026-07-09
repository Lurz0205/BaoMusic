import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { playerManager } from '../music/PlayerManager.js';

export const pauseCommand = {
  data: new SlashCommandBuilder()
    .setName('pause')
    .setDescription('Tạm dừng bài hát đang phát.'),

  async execute(interaction: ChatInputCommandInteraction) {
    const queue = playerManager.get(interaction.guildId || '');
    if (!queue || !queue.currentTrack) {
      return interaction.reply({
        content: '❌ Không có bài hát nào đang phát để tạm dừng!',
        ephemeral: true,
      });
    }

    const paused = queue.pause();
    if (paused) {
      await interaction.reply({
        content: `⏸️ Đã tạm dừng phát nhạc bài: **${queue.currentTrack.title}**!`,
      });
    } else {
      await interaction.reply({
        content: '❌ Trình phát nhạc đã được tạm dừng từ trước!',
        ephemeral: true,
      });
    }
  }
};
