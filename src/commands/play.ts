import { 
  ChatInputCommandInteraction, 
  AutocompleteInteraction, 
  GuildMember, 
  SlashCommandBuilder, 
  EmbedBuilder 
} from 'discord.js';
import { joinVoiceChannel } from '@discordjs/voice';
import play from 'play-dl';
import { YouTube } from 'youtube-sr';
import { playerManager } from '../music/PlayerManager.js';
import { Track } from '../music/Track.js';
import { logger } from '../utils/logger.js';
import { YouTubeSearch } from '../utils/youtube-search.js';

export const playCommand = {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Phát nhạc từ YouTube, Spotify, SoundCloud hoặc tìm kiếm tên bài hát.')
    .addStringOption((option) =>
      option
        .setName('input')
        .setDescription('Tên bài hát, link YouTube, Spotify, hoặc SoundCloud.')
        .setRequired(true)
        .setAutocomplete(true)
    ),

  /**
   * Slash command autocomplete search suggestion handler.
   * Leverages youtube-sr for reliable and fast suggestions.
   */
  async autocomplete(interaction: AutocompleteInteraction) {
    const focusedValue = interaction.options.getFocused();
    if (!focusedValue || focusedValue.trim().length === 0) {
      return interaction.respond([]);
    }

    try {
      // Use youtube-sr suggestions for autocomplete as it is extremely robust and fast
      // Suggestions are usually just strings, which is exactly what we want for autocomplete
      const suggestions = await YouTube.getSuggestions(focusedValue);
      
      const choices = suggestions.slice(0, 25).map((query) => {
        const title = typeof query === 'string' ? query : (query.title || 'Unknown');
        const formattedTitle = title.length > 95 ? title.slice(0, 92) + '...' : title;
        return {
          name: formattedTitle,
          value: title, // Value will be the query string, which /play handles fine
        };
      });
      
      await interaction.respond(choices);
    } catch (err: any) {
      logger.warn('Autocomplete via youtube-sr suggestions failed:', err.message || err);
      // Fail silently for interaction
      try {
        await interaction.respond([]);
      } catch (e) {}
    }
  },

  async execute(interaction: ChatInputCommandInteraction) {
    const member = interaction.member as GuildMember;
    const voiceChannel = member?.voice?.channel;

    if (!voiceChannel) {
      return interaction.reply({
        content: '❌ Bạn phải ở trong một kênh thoại (voice channel) để yêu cầu phát nhạc!',
        ephemeral: true,
      });
    }

    const botMember = interaction.guild?.members.me;
    if (botMember && !voiceChannel.permissionsFor(botMember).has(['Connect', 'Speak'])) {
      return interaction.reply({
        content: '❌ Bot không có quyền truy cập (`Connect`) hoặc quyền nói (`Speak`) trong kênh thoại của bạn!',
        ephemeral: true,
      });
    }

    const input = interaction.options.getString('input', true);
    await interaction.deferReply();

    try {
      // Connect/Retrieve voice connection
      let queue = playerManager.get(voiceChannel.guild.id);
      
      if (!queue) {
        const connection = joinVoiceChannel({
          channelId: voiceChannel.id,
          guildId: voiceChannel.guild.id,
          adapterCreator: voiceChannel.guild.voiceAdapterCreator,
          selfDeaf: true,
          selfMute: false,
        });

        queue = playerManager.create(
          voiceChannel.guild.id,
          voiceChannel.guild.name,
          connection,
          voiceChannel.id,
          voiceChannel.name,
          interaction.channelId || undefined
        );
      }

      // Resolve and create tracks from user input
      const requester = {
        username: interaction.user.username,
        avatarUrl: interaction.user.displayAvatarURL() || undefined,
      };

      const tracks = await Track.from(input, requester);

      if (tracks.length === 0) {
        return interaction.editReply('❌ Không thể tìm thấy hoặc xử lý bài hát từ yêu cầu của bạn.');
      }

      // Add songs to queue
      queue.addTracks(tracks);

      if (tracks.length > 1) {
        // Playlist added embed
        const embed = new EmbedBuilder()
          .setColor('#2ECC71')
          .setTitle('📚 Đã thêm Playlist vào hàng đợi')
          .setDescription(`Đã nạp thành công **${tracks.length}** bài hát vào hàng chờ.`)
          .addFields(
            { name: 'Kênh phát', value: `🔊 ${voiceChannel.name}`, inline: true },
            { name: 'Yêu cầu bởi', value: `👤 ${interaction.user.username}`, inline: true }
          )
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      } else {
        // Single track added embed
        const track = tracks[0];
        const isNowPlaying = queue.currentTrack === track;

        const embed = new EmbedBuilder()
          .setColor(isNowPlaying ? '#1DB954' : '#3498DB')
          .setTitle(isNowPlaying ? '🎶 Đang phát' : '📥 Đã thêm vào hàng chờ')
          .setDescription(`[${track.title}](${track.url})`)
          .addFields(
            { name: 'Thời lượng', value: `⏱️ ${track.durationString}`, inline: true },
            { name: 'Nguồn', value: `🔌 ${track.source.toUpperCase()}`, inline: true },
            { name: 'Yêu cầu bởi', value: `👤 ${interaction.user.username}`, inline: true }
          );

        if (track.thumbnail) {
          embed.setThumbnail(track.thumbnail);
        }

        await interaction.editReply({ embeds: [embed] });
      }
    } catch (err: any) {
      logger.error('Error in /play command execution:', err);
      await interaction.editReply(`❌ Gặp sự cố khi xử lý bài hát: **${err.message || err}**`);
    }
  }
};
