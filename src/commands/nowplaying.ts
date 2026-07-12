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
      const currentSec = queue.playbackDuration;
      const totalSec = track.duration;
      
      const formatTime = (secs: number) => {
        const m = Math.floor(secs / 60);
        const s = Math.floor(secs % 60);
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

    const color = 0xFF0000;

    const embed = new EmbedBuilder()
      .setColor(color)
      .setAuthor({ name: '🎶 Đang Phát Ngay Bây Giờ' })
      .setTitle(track.title)
      .setURL(track.url)
      .setDescription(progressString || `⏱️ \`${durationString}\``)
      .addFields(
        { name: 'Yêu cầu bởi', value: `👤 ${track.requestedBy.username}`, inline: true },
        { name: 'Âm lượng', value: `🔊 ${queue.volume}%`, inline: true },
        { name: 'Chế độ lặp', value: queue.loopMode === 'track' ? '🔂 Bài hát' : (queue.loopMode === 'queue' ? '🔁 Danh sách' : '▶️ Tắt'), inline: true }
      )
      .setFooter({ text: `Nguồn: ${track.source.toUpperCase()} • Bấm /queue để xem danh sách chờ` });

    if (track.thumbnail) {
      embed.setImage(track.thumbnail); // use setImage for larger thumbnail
    }

    await interaction.reply({ embeds: [embed] });
  }
};
