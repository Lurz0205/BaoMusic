import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { playerManager } from '../music/PlayerManager.js';

export const skipCommand = {
  data: new SlashCommandBuilder()
    .setName('skip')
    .setDescription('Bỏ qua bài hát đang phát hiện tại.'),

  async execute(interaction: ChatInputCommandInteraction) {
    const queue = playerManager.get(interaction.guildId || '');
    if (!queue || !queue.currentTrack) {
      return interaction.reply({
        content: '❌ Không có bài hát nào đang phát để bỏ qua!',
        ephemeral: true,
      });
    }

    const skipped = queue.skip();
    if (skipped) {
      await interaction.reply({
        content: `⏭️ Đã bỏ qua bài hát: **${queue.currentTrack.title}**!`,
      });
    } else {
      await interaction.reply({
        content: '❌ Không thể bỏ qua bài hát hiện tại.',
        ephemeral: true,
      });
    }
  }
};
