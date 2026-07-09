import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { playerManager } from '../music/PlayerManager.js';

export const resumeCommand = {
  data: new SlashCommandBuilder()
    .setName('resume')
    .setDescription('Tiếp tục phát bài hát đang bị tạm dừng.'),

  async execute(interaction: ChatInputCommandInteraction) {
    const queue = playerManager.get(interaction.guildId || '');
    if (!queue || !queue.currentTrack) {
      return interaction.reply({
        content: '❌ Không có bài hát nào đang phát trong hàng chờ!',
        ephemeral: true,
      });
    }

    const resumed = queue.resume();
    if (resumed) {
      await interaction.reply({
        content: `▶️ Đã tiếp tục phát bài hát: **${queue.currentTrack.title}**!`,
      });
    } else {
      await interaction.reply({
        content: '❌ Trình phát nhạc đang phát bình thường, không bị tạm dừng!',
        ephemeral: true,
      });
    }
  }
};
