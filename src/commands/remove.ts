import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { playerManager } from '../music/PlayerManager.js';

export const removeCommand = {
  data: new SlashCommandBuilder()
    .setName('remove')
    .setDescription('Xóa một bài hát cụ thể khỏi danh sách chờ bằng số thứ tự.')
    .addIntegerOption((option) =>
      option
        .setName('position')
        .setDescription('Vị trí bài hát trong danh sách chờ (ví dụ: 1, 2, ...).')
        .setRequired(true)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const queue = playerManager.get(interaction.guildId || '');
    if (!queue) {
      return interaction.reply({
        content: '❌ Không có trình phát nhạc nào đang chạy!',
        ephemeral: true,
      });
    }

    const position = interaction.options.getInteger('position', true);
    
    // Validate position index.
    // In our list representation, index 0 is current. Upcomings start at index 1.
    if (position <= 0 || position >= queue.tracks.length) {
      return interaction.reply({
        content: `❌ Vị trí không hợp lệ! Vui lòng nhập số thứ tự từ \`1\` đến \`${queue.tracks.length - 1}\`.`,
        ephemeral: true,
      });
    }

    const removed = queue.removeTrack(position);
    if (removed) {
      await interaction.reply({
        content: `🗑️ Đã xóa bài hát **${removed.title}** ra khỏi vị trí số \`${position}\` trong danh sách chờ!`,
      });
    } else {
      await interaction.reply({
        content: '❌ Không tìm thấy bài hát tại vị trí đó để xóa.',
        ephemeral: true,
      });
    }
  }
};
