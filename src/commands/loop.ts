import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { playerManager } from '../music/PlayerManager.js';

export const loopCommand = {
  data: new SlashCommandBuilder()
    .setName('loop')
    .setDescription('Chuyển đổi chế độ lặp phát nhạc (Tắt, Lặp 1 Bài, Lặp Hàng Đợi).')
    .addStringOption((option) =>
      option
        .setName('mode')
        .setDescription('Chế độ lặp bạn muốn chọn.')
        .setRequired(true)
        .addChoices(
          { name: 'Tắt lặp (Off)', value: 'off' },
          { name: 'Lặp 1 bài (Track)', value: 'track' },
          { name: 'Lặp cả hàng đợi (Queue)', value: 'queue' }
        )
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const queue = playerManager.get(interaction.guildId || '');
    if (!queue) {
      return interaction.reply({
        content: '❌ Không có trình phát nhạc nào đang chạy!',
        ephemeral: true,
      });
    }

    const mode = interaction.options.getString('mode', true) as 'off' | 'track' | 'queue';
    queue.loopMode = mode;

    let modeViet = '';
    if (mode === 'off') modeViet = 'TẮT LẶP';
    if (mode === 'track') modeViet = 'LẶP LẠI 1 BÀI ĐANG PHÁT';
    if (mode === 'queue') modeViet = 'LẶP LẠI TOÀN BỘ HÀNG ĐỢI NHẠC';

    await interaction.reply({
      content: `🔄 Đã chuyển chế độ lặp nhạc thành: **${modeViet}**!`,
    });
  }
};
