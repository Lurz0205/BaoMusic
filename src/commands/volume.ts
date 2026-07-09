import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { playerManager } from '../music/PlayerManager.js';

export const volumeCommand = {
  data: new SlashCommandBuilder()
    .setName('volume')
    .setDescription('Điều chỉnh âm lượng của trình phát nhạc (0% - 100%).')
    .addIntegerOption((option) =>
      option
        .setName('percent')
        .setDescription('Âm lượng mong muốn (ví dụ: 50, 80, 100).')
        .setRequired(true)
        .setMinValue(0)
        .setMaxValue(100)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const queue = playerManager.get(interaction.guildId || '');
    if (!queue) {
      return interaction.reply({
        content: '❌ Không có trình phát nhạc nào đang chạy!',
        ephemeral: true,
      });
    }

    const volume = interaction.options.getInteger('percent', true);
    queue.setVolume(volume);

    await interaction.reply({
      content: `🔊 Đã thiết lập âm lượng phát nhạc thành: **${volume}%**!`,
    });
  }
};
