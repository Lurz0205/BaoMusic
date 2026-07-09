import { ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { playerManager } from '../music/PlayerManager.js';

export const queueCommand = {
  data: new SlashCommandBuilder()
    .setName('queue')
    .setDescription('Xem danh sách nhạc đang chờ phát ở máy chủ.'),

  async execute(interaction: ChatInputCommandInteraction) {
    const queue = playerManager.get(interaction.guildId || '');
    if (!queue || !queue.currentTrack) {
      return interaction.reply({
        content: '❌ Hàng đợi nhạc trống không! Nhập `/play` để thêm nhạc mới.',
        ephemeral: true,
      });
    }

    const current = queue.currentTrack;
    const tracksList = queue.tracks;

    // Build the queue description
    let description = `**Đang phát:**\n🎶 [${current.title}](${current.url}) | \`⏱️ ${current.durationString}\` (Yêu cầu bởi: ${current.requestedBy.username})\n\n`;

    if (tracksList.length <= 1) {
      description += `*Không có bài hát nào tiếp theo trong hàng chờ.*`;
    } else {
      description += `**Danh sách chờ tiếp theo (Tối đa 10 bài):**\n`;
      // Start from 1 because index 0 is the current song
      const maxTracksToShow = Math.min(tracksList.length, 11);
      for (let i = 1; i < maxTracksToShow; i++) {
        const track = tracksList[i];
        description += `\`${i}.\` [${track.title}](${track.url}) | \`⏱️ ${track.durationString}\` (Yêu cầu bởi: ${track.requestedBy.username})\n`;
      }

      if (tracksList.length > 11) {
        description += `\n*và ${tracksList.length - 11} bài hát khác...*`;
      }
    }

    const embed = new EmbedBuilder()
      .setColor('#34495E')
      .setTitle(`📋 Hàng Đợi Nhạc - ${queue.guildName}`)
      .setDescription(description)
      .addFields(
        { name: 'Lặp lại (Loop)', value: `🔄 ${queue.loopMode.toUpperCase()}`, inline: true },
        { name: 'Autoplay', value: queue.autoplay ? '🟢 Bật' : '🔴 Tắt', inline: true },
        { name: 'Treo phòng 24/7', value: queue.is247 ? '🟢 Bật' : '🔴 Tắt', inline: true }
      )
      .setFooter({ text: `Tổng cộng: ${tracksList.length} bài hát | Âm lượng: ${queue.volume}%` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }
};
