import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { playerManager } from '../music/PlayerManager.js';

export const stopCommand = {
  data: new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Dừng phát nhạc và xóa sạch danh sách hàng chờ.'),

  async execute(interaction: ChatInputCommandInteraction) {
    const queue = playerManager.get(interaction.guildId || '');
    if (!queue) {
      return interaction.reply({
        content: '❌ Không có trình phát nhạc nào đang chạy ở máy chủ này!',
        ephemeral: true,
      });
    }

    queue.stop();
    await interaction.reply({
      content: '🛑 Đã dừng phát nhạc, hủy bỏ tất cả bài hát và dọn dẹp hàng đợi!',
    });
  }
};
