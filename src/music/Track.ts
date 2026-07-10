import play from 'play-dl';
import { createAudioResource, AudioResource, StreamType } from '@discordjs/voice';
import { TrackData } from '../types.js';
import { logger } from '../utils/logger.js';
import { YouTubeSearch, ytDlpGetMetadata, spawnYtDlpStream, searchYouTube, spawnStream } from '../utils/youtube-search.js';

export class Track implements TrackData {
  public readonly title: string;
  public readonly url: string;
  public readonly thumbnail?: string;
  public readonly duration: number;
  public readonly durationString: string;
  public readonly requestedBy: {
    username: string;
    avatarUrl?: string;
  };
  public readonly source: 'youtube' | 'spotify' | 'soundcloud' | 'unknown';

  constructor(data: TrackData) {
    this.title = data.title;
    this.url = data.url;
    this.thumbnail = data.thumbnail;
    this.duration = data.duration;
    this.durationString = data.durationString;
    this.requestedBy = data.requestedBy;
    this.source = data.source;
  }

  /**
   * Generates an AudioResource from this track's URL to be played by @discordjs/voice AudioPlayer.
   * Employs retry and buffering logic to ensure maximum stability.
   */
  public async createAudioResource(retryCount = 0): Promise<AudioResource<Track>> {
    try {
      let finalUrl = this.url;

      // Handle Spotify tracks: search and get equivalent YouTube URL
      if (this.source === 'spotify') {
        const isAlreadyYoutube = this.url.includes('youtube.com') || this.url.includes('youtu.be');
        if (isAlreadyYoutube) {
          finalUrl = this.url;
        } else {
          logger.info(`Searching YouTube equivalent for Spotify track: "${this.title}"...`);
          let youtubeUrl: string | null = null;
          try {
            const searchResults = await searchYouTube(this.title, 1, 'youtube');
            if (searchResults && searchResults.length > 0) {
              youtubeUrl = searchResults[0].url;
              logger.info(`Found YouTube equivalent for Spotify: "${searchResults[0].title}" (${youtubeUrl})`);
            }
          } catch (err: any) {
            logger.error(`YouTube search failed for Spotify conversion:`, err.message || err);
          }

          if (youtubeUrl) {
            finalUrl = youtubeUrl;
          } else {
            throw new Error(`Could not find a YouTube equivalent for Spotify track: "${this.title}"`);
          }
        }
      }

      // Stream the audio using play-dl (with yt-dlp fallback)
      logger.info(`Creating audio stream for: "${this.title}" (${finalUrl})`);
      const stream = await spawnStream(finalUrl);

      const resource = createAudioResource(stream, {
        inputType: StreamType.Arbitrary,
        metadata: this,
        inlineVolume: true,
      });

      return resource;
    } catch (err: any) {
      logger.error(`Error creating audio resource for "${this.title}" (Attempt ${retryCount + 1}/3):`, err.message || err);
      if (retryCount < 2) {
        logger.info(`Retrying stream generation for "${this.title}"...`);
        return this.createAudioResource(retryCount + 1);
      }
      throw err;
    }
  }

  /**
   * Helper to serialize track details for JSON APIs
   */
  public toJSON(): TrackData {
    return {
      title: this.title,
      url: this.url,
      thumbnail: this.thumbnail,
      duration: this.duration,
      durationString: this.durationString,
      requestedBy: this.requestedBy,
      source: this.source,
    };
  }

  /**
   * Parse arbitrary user input or URL into Track objects
   */
  public static async from(
    input: string,
    requestedBy: { username: string; avatarUrl?: string },
    platform: string = 'youtube'
  ): Promise<Track[]> {
    const cleanInput = input.trim();

    // 1. Check if the input is a Spotify link
    if (cleanInput.includes('spotify.com')) {
      try {
        try {
          if (play.is_expired()) {
            logger.info('Spotify token is expired or not loaded. Refreshing Spotify token...');
            await play.refreshToken();
          }
        } catch (err: any) {
          logger.warn(`Failed to refresh Spotify token (non-fatal): ${err.message || err}`);
        }
        const spotifyData = await play.spotify(cleanInput);
        if (spotifyData.type === 'playlist' || spotifyData.type === 'album') {
          const tracks = await (spotifyData as any).all_tracks();
          return tracks.map((t: any) => new Track({
            title: `${t.name} - ${t.artists.map((a: any) => a.name).join(', ')}`,
            url: t.url,
            thumbnail: '',
            duration: t.durationInSec,
            durationString: new Date(t.durationInSec * 1000).toISOString().substr(14, 5),
            requestedBy,
            source: 'spotify'
          }));
        } else if (spotifyData.type === 'track') {
          const t = spotifyData as any;
          return [new Track({
            title: `${t.name} - ${t.artists.map((a: any) => a.name).join(', ')}`,
            url: t.url,
            thumbnail: t.thumbnail?.url || '',
            duration: t.durationInSec,
            durationString: new Date(t.durationInSec * 1000).toISOString().substr(14, 5),
            requestedBy,
            source: 'spotify'
          })];
        }
      } catch (err: any) {
        logger.warn(`Spotify metadata parsing via play-dl failed, trying oEmbed fallback:`, err.message || err);
        
        try {
          // Attempt to get title via Spotify oEmbed (works without API keys)
          const oEmbedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(cleanInput)}`;
          const response = await fetch(oEmbedUrl);
          if (response.ok) {
            const data: any = await response.json();
            const title = data.title || 'Unknown Spotify Track';
            
            // Search YouTube with the extracted title
            logger.info(`Searching YouTube for Spotify track: "${title}"`);
            const results = await searchYouTube(title, 1, 'youtube');
            
            return results.map(item => new Track({
              title: item.title,
              url: item.url,
              thumbnail: item.thumbnail,
              duration: item.duration,
              durationString: item.durationString,
              requestedBy,
              source: 'spotify'
            }));
          }
        } catch (oEmbedErr) {
          logger.error(`Spotify oEmbed fallback also failed:`, oEmbedErr);
        }

        // Final fallback: use yt-dlp metadata directly if it somehow works
        try {
          const results = await ytDlpGetMetadata(cleanInput);
          return results.map(item => new Track({
            title: item.title,
            url: item.url,
            thumbnail: item.thumbnail,
            duration: item.duration,
            durationString: item.durationString,
            requestedBy,
            source: 'spotify'
          }));
        } catch (ytErr: any) {
          logger.error(`Final yt-dlp fallback also failed for Spotify URL:`, ytErr.message || ytErr);
          throw new Error(`Không thể lấy thông tin bài hát từ Spotify. Vui lòng kiểm tra lại link hoặc sử dụng link YouTube.`);
        }
      }
    }

    // 2. Check if the input is a direct URL (YouTube, SoundCloud, or other sites supported by yt-dlp)
    if (cleanInput.startsWith('http://') || cleanInput.startsWith('https://')) {
      try {
        logger.info(`Fetching metadata via yt-dlp for direct URL: "${cleanInput}"`);
        const metadataList = await ytDlpGetMetadata(cleanInput);
        const source = cleanInput.includes('soundcloud.com') ? 'soundcloud' : 'youtube';
        
        return metadataList.map(item => new Track({
          title: item.title,
          url: item.url,
          thumbnail: item.thumbnail,
          duration: item.duration,
          durationString: item.durationString,
          requestedBy,
          source
        }));
      } catch (err: any) {
        logger.error(`yt-dlp metadata fetch failed for URL "${cleanInput}":`, err.message || err);
        throw new Error(`Không thể lấy thông tin bài hát từ URL này. Đảm bảo link hoạt động hoặc cookie của bạn hợp lệ. Chi tiết: ${err.message || err}`);
      }
    }

    // 3. Search query (fallback)
    logger.info(`Searching via yt-dlp for query: "${cleanInput}" (platform: ${platform})`);
    try {
      const searchResults = await searchYouTube(cleanInput, 1, platform);
      if (searchResults && searchResults.length > 0) {
        const v = searchResults[0];
        return [new Track({
          title: v.title,
          url: v.url,
          thumbnail: v.thumbnail,
          duration: v.duration,
          durationString: v.durationString,
          requestedBy,
          source: platform as any
        })];
      }
    } catch (err: any) {
      logger.error(`yt-dlp search failed for query "${cleanInput}":`, err.message || err);
    }

    throw new Error('Không tìm thấy kết quả hoặc bài hát nào cho yêu cầu này.');
  }
}
