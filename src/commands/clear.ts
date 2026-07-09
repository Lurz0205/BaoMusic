import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { playerManager } from '../music/PlayerManager.js';

export const clearCommand = {
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Xóa sạch toàn bộ danh sách nhạc chờ (giữ lại bài hát đang phát).'),

  async execute(interaction: ChatInputCommandInteraction) {
    const queue = playerManager.get(interaction.guildId || '');
    if (!queue) {
      return interaction.reply({
        content: '❌ Không có trình phát nhạc nào đang hoạt động ở máy chủ này!',
        ephemeral: true,
      });
    }

    if (queue.tracks.length <= 1) {
      return interaction.reply({
        content: '❌ Hàng đợi nhạc trống hoặc không có bài hát nào phía sau để dọn dẹp!',
        ephemeral: true,
      });
    }

    queue.clear();
    await interaction.reply({
      content: '🧹 Đã dọn dẹp sạch toàn bộ danh sách chờ tiếp theo!',
    });
  }
};
