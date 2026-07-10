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
    )
    .addStringOption((option) =>
      option
        .setName('platform')
        .setDescription('Nền tảng tìm kiếm (Mặc định: YouTube)')
        .setRequired(false)
        .addChoices(
          { name: 'YouTube', value: 'youtube' },
          { name: 'SoundCloud', value: 'soundcloud' },
          { name: 'Spotify', value: 'spotify' }
        )
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
      // 1. YouTube-SR suggestions (fastest)
      // Use youtube-sr suggestions for autocomplete as it is extremely robust and fast
      // Wrapped in Promise.race with a 2-second timeout so it never exceeds Discord's 3-second limit.
      const timeoutPromise = new Promise<string[]>((resolve) => setTimeout(() => resolve([]), 2000));
      const suggestionsPromise = YouTube.getSuggestions(focusedValue);
      const suggestions = await Promise.race([suggestionsPromise, timeoutPromise]);

      
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
    await interaction.deferReply();

    const member = interaction.member as GuildMember;
    const voiceChannel = member?.voice?.channel;

    if (!voiceChannel) {
      return interaction.editReply({
        content: '❌ Bạn phải ở trong một kênh thoại (voice channel) để yêu cầu phát nhạc!'
      });
    }

    const botMember = interaction.guild?.members.me;
    if (botMember && !voiceChannel.permissionsFor(botMember).has(['Connect', 'Speak'])) {
      return interaction.editReply({
        content: '❌ Bot không có quyền truy cập (`Connect`) hoặc quyền nói (`Speak`) trong kênh thoại của bạn!'
      });
    }

    const input = interaction.options.getString('input', true);
    const platform = interaction.options.getString('platform') || 'youtube';

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

      const tracks = await Track.from(input, requester, platform);

      if (tracks.length === 0) {
        return interaction.editReply('❌ Không thể tìm thấy hoặc xử lý bài hát từ yêu cầu của bạn.');
      }

      // Add songs to queue
      queue.addTracks(tracks);

      if (tracks.length > 1) {
        // Playlist added embed
        const firstTrackSource = tracks[0].source;
        const color = firstTrackSource === 'spotify' ? '#1DB954' : (firstTrackSource === 'soundcloud' ? '#FF5500' : '#FF0000');
        const embed = new EmbedBuilder()
          .setColor(color)
          .setAuthor({ name: '📚 Đã thêm Playlist vào hàng đợi' })
          .setTitle(`Đã nạp thành công ${tracks.length} bài hát`)
          .addFields(
            { name: 'Kênh phát', value: `🔊 ${voiceChannel.name}`, inline: true },
            { name: 'Yêu cầu bởi', value: `👤 ${interaction.user.username}`, inline: true },
            { name: 'Nguồn', value: `🔌 ${firstTrackSource.toUpperCase()}`, inline: true }
          )
          .setFooter({ text: `Bot âm nhạc cao cấp • Hàng đợi hiện có: ${queue.tracks.length} bài` })
          .setTimestamp();

        if (tracks[0].thumbnail) {
          embed.setThumbnail(tracks[0].thumbnail);
        }

        await interaction.editReply({ embeds: [embed] });
      } else {
        // Single track added embed
        const track = tracks[0];
        const isNowPlaying = queue.currentTrack === track;
        const color = track.source === 'spotify' ? '#1DB954' : (track.source === 'soundcloud' ? '#FF5500' : '#FF0000');

        const embed = new EmbedBuilder()
          .setColor(color)
          .setAuthor({ name: isNowPlaying ? '🎶 Đang phát ngay bây giờ' : '📥 Đã thêm vào hàng chờ', iconURL: requester.avatarUrl })
          .setTitle(track.title)
          .setURL(track.url)
          .setDescription(`⏱️ \`${track.durationString}\``)
          .addFields(
            { name: 'Yêu cầu bởi', value: `👤 ${interaction.user.username}`, inline: true },
            { name: 'Nguồn', value: `🔌 ${track.source.toUpperCase()}`, inline: true }
          )
          .setFooter({ text: `Vị trí trong hàng đợi: ${queue.tracks.length > 0 ? queue.tracks.length - 1 : 0}` });

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
