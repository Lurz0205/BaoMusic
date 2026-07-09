import { ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { playerManager } from '../music/PlayerManager.js';

export const nowplayingCommand = {
  data: new SlashCommandBuilder()
    .setName('nowplaying')
    .setDescription('Xem chi tiết bài hát đang được phát hiện tại.'),

  async execute(interaction: ChatInputCommandInteraction) {
    const queue = playerManager.get(interaction.guildId || '');
    if (!queue || !queue.currentTrack) {
      return interaction.reply({
        content: '❌ Hiện không có bài hát nào đang được phát!',
        ephemeral: true,
      });
    }

    const track = queue.currentTrack;
    const resource = queue.currentResource;
    
    // Calculate playback progress
    let progressString = '';
    let durationString = track.durationString;
    
    if (resource) {
      const currentMs = resource.playbackDuration;
      const currentSec = Math.floor(currentMs / 1000);
      const totalSec = track.duration;
      
      const formatTime = (secs: number) => {
        const m = Math.floor(secs / 60);
        const s = secs % 60;
        return `${m}:${s < 10 ? '0' : ''}${s}`;
      };

      const currentTimeStr = formatTime(currentSec);
      
      if (totalSec > 0) {
        const barSize = 15;
        const progressPercent = currentSec / totalSec;
        const progressIndex = Math.min(Math.floor(progressPercent * barSize), barSize - 1);
        
        let bar = '';
        for (let i = 0; i < barSize; i++) {
          if (i === progressIndex) {
            bar += '🔘';
          } else {
            bar += '▬';
          }
        }
        
        progressString = `\`${currentTimeStr}\` ${bar} \`${durationString}\``;
      } else {
        // Live streams
        progressString = `\`🔴 LIVE\` / \`${currentTimeStr} phát sóng\``;
      }
    }

    const embed = new EmbedBuilder()
      .setColor('#9B59B6')
      .setTitle('🎶 Đang Phát')
      .setDescription(`[${track.title}](${track.url})`)
      .addFields(
        { name: 'Yêu cầu bởi', value: `👤 ${track.requestedBy.username}`, inline: true },
        { name: 'Nguồn', value: `🔌 ${track.source.toUpperCase()}`, inline: true },
        { name: 'Âm lượng', value: `🔊 ${queue.volume}%`, inline: true }
      );

    if (progressString) {
      embed.addFields({ name: 'Tiến trình', value: progressString });
    }

    if (track.thumbnail) {
      embed.setThumbnail(track.thumbnail);
    }

    await interaction.reply({ embeds: [embed] });
  }
};
