import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { playerManager } from '../music/PlayerManager.js';

export const voice247Command = {
  data: new SlashCommandBuilder()
    .setName('247')
    .setDescription('Treo bot ở trong kênh thoại kể cả khi không phát nhạc (Chế độ 24/7).')
    .addStringOption((option) =>
      option
        .setName('action')
        .setDescription('Bật hoặc Tắt chế độ 24/7.')
        .setRequired(true)
        .addChoices(
          { name: 'Kích hoạt (Enable)', value: 'enable' },
          { name: 'Hủy kích hoạt (Disable)', value: 'disable' }
        )
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const queue = playerManager.get(interaction.guildId || '');
    if (!queue) {
      return interaction.editReply({
        content: '❌ Bot phải ở trong một kênh thoại để kích hoạt chế độ này! Gõ `/join` hoặc `/play` trước.',
      });
    }

    const action = interaction.options.getString('action', true);
    const enable = action === 'enable';
    
    queue.set247(enable);

    await interaction.editReply({
      content: `📌 Chế độ treo phòng **24/7** đã được: **${enable ? '🟢 KÍCH HOẠT' : '🔴 HỦY KÍCH HOẠT'}** cho máy chủ này!`,
    });
  }
};
