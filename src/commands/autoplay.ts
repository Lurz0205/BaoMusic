import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { playerManager } from '../music/PlayerManager.js';
import { logger } from '../utils/logger.js';

export const autoplayCommand = {
  data: new SlashCommandBuilder()
    .setName('autoplay')
    .setDescription('Bật hoặc tắt chế độ tự động phát nhạc.')
    .addBooleanOption(option =>
      option.setName('enable')
        .setDescription('Kích hoạt hoặc vô hiệu hóa autoplay')
        .setRequired(true)),

  async execute(interaction: ChatInputCommandInteraction) {
    logger.info(`autoplay command executed for guildId: ${interaction.guildId}`);
    const queue = playerManager.get(interaction.guildId || '');
    if (!queue) {
      logger.info(`Autoplay failed: queue exists? ${!!queue}`);
      return interaction.editReply({
        content: '❌ Bot phải ở trong một kênh thoại để kích hoạt chế độ này! Gõ `/join` hoặc `/play` trước.',
      });
    }

    const enable = interaction.options.getBoolean('enable') || false;
    queue.setAutoplay(enable);

    await interaction.editReply({
      content: `🔄 Chế độ tự động phát (**Autoplay**) đã được: **${enable ? '🟢 KÍCH HOẠT' : '🔴 HỦY KÍCH HOẠT'}** cho máy chủ này!`,
    });
  }
};
