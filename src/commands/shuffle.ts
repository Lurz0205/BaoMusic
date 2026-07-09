import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { playerManager } from '../music/PlayerManager.js';

export const shuffleCommand = {
  data: new SlashCommandBuilder()
    .setName('shuffle')
    .setDescription('Xáo trộn ngẫu nhiên danh sách nhạc chờ.'),

  async execute(interaction: ChatInputCommandInteraction) {
    const queue = playerManager.get(interaction.guildId || '');
    if (!queue) {
      return interaction.reply({
        content: '❌ Không có trình phát nhạc nào đang chạy!',
        ephemeral: true,
      });
    }

    if (queue.tracks.length <= 1) {
      return interaction.reply({
        content: '❌ Danh sách hàng chờ phải có ít nhất 2 bài hát mới có thể xáo trộn!',
        ephemeral: true,
      });
    }

    queue.shuffle();
    await interaction.reply({
      content: '🔀 Đã xáo trộn ngẫu nhiên thứ tự các bài hát trong hàng chờ!',
    });
  }
};
