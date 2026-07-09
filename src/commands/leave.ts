import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { playerManager } from '../music/PlayerManager.js';

export const leaveCommand = {
  data: new SlashCommandBuilder()
    .setName('leave')
    .setDescription('Cho bot rời khỏi kênh thoại và xóa toàn bộ hàng đợi.'),

  async execute(interaction: ChatInputCommandInteraction) {
    const guildId = interaction.guildId;
    if (!guildId) return;

    const queue = playerManager.get(guildId);
    if (!queue) {
      return interaction.reply({
        content: '❌ Bot không ở trong bất kỳ kênh thoại nào của server này!',
        ephemeral: true,
      });
    }

    // Clean up and delete player
    playerManager.delete(guildId);

    await interaction.reply({
      content: '👋 Đã rời khỏi kênh thoại và làm trống danh sách nhạc chờ!',
    });
  }
};
