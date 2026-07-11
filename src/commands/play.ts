import { 
  ChatInputCommandInteraction, 
  AutocompleteInteraction, 
  GuildMember, 
  SlashCommandBuilder, 
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from 'discord.js';
import { joinVoiceChannel } from '@discordjs/voice';
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
      try {
        if (!interaction.responded) {
          await interaction.respond([]);
        }
      } catch (e) {}
      return;
    }

    try {
      // 1. YouTube-SR suggestions (fastest)
      // Use youtube-sr suggestions for autocomplete as it is extremely robust and fast
      // Wrapped in Promise.race with a 1.5-second timeout so it never exceeds Discord's 3-second limit.
      const timeoutPromise = new Promise<string[]>((resolve) => setTimeout(() => resolve([]), 1500));
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
      
      if (!interaction.responded) {
        await interaction.respond(choices);
      }
    } catch (err: any) {
      logger.warn('Autocomplete via youtube-sr suggestions failed:', err.message || err);
      // Fail silently for interaction
      try {
        if (!interaction.responded) {
          await interaction.respond([]);
        }
      } catch (e) {}
    }
  },

  async execute(interaction: ChatInputCommandInteraction) {
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

      if (tracks.length === 1) {
        const track = tracks[0];
        await interaction.editReply({ 
          content: `✅ Đã thêm **${track.title}** vào hàng chờ!`,
          embeds: [] 
        });
      } else {
        const color = tracks[0].source === 'spotify' ? 0x1DB954 : (tracks[0].source === 'soundcloud' ? 0xFF5500 : 0xFF0000);
        const embed = new EmbedBuilder()
          .setColor(color)
          .setAuthor({ 
            name: '📚 Đã nạp thành công Playlist', 
            iconURL: requester.avatarUrl 
          })
          .setTitle(`Đã nạp thành công ${tracks.length} bài hát`)
          .setDescription(`Kênh: ${voiceChannel.name}`);

        await interaction.editReply({ embeds: [embed] });
      }
    } catch (err: any) {
      logger.error('Error in /play command execution:', err);
      await interaction.editReply(`❌ Gặp sự cố khi xử lý bài hát: **${err.message || err}**`);
    }
  }
};
