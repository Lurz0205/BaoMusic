import { createAudioResource, AudioResource, StreamType } from '@discordjs/voice';
import { TrackData } from '../types.js';
import { logger } from '../utils/logger.js';
import { ytDlpGetMetadata, searchYouTube, spawnStream } from '../utils/youtube-search.js';
import { SpotifyUtils } from '../utils/spotify.js';

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
  public readonly source: 'youtube' | 'unknown' | 'spotify';

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
   * Generates an AudioResource from this track's URL using the multi-engine cookie-free resolver.
   */
  public async createAudioResource(retryCount = 0): Promise<AudioResource<Track>> {
    try {
      let playUrl = this.url;

      // If it's a Spotify track, find its YouTube equivalent first
      if (this.source === 'spotify' || playUrl.includes('spotify.com')) {
        logger.info(`Searching YouTube equivalent for Spotify track: "${this.title}"`);
        const searchResults = await searchYouTube(`${this.title}`, 1);
        if (searchResults && searchResults.length > 0) {
          playUrl = searchResults[0].url;
          logger.info(`Found YouTube equivalent for Spotify: ${playUrl}`);
        } else {
          throw new Error('Không tìm thấy bản phối phù hợp cho bài hát Spotify này.');
        }
      }

      logger.info(`Creating audio stream for: "${this.title}" (${playUrl})`);
      const stream = await spawnStream(playUrl, this.title);

      const resource = createAudioResource(stream, {
        inputType: StreamType.Arbitrary,
        metadata: this,
        inlineVolume: true,
      });

      return resource;
    } catch (err: any) {
      logger.error(`Error creating audio resource for "${this.title}" (Attempt ${retryCount + 1}/2):`, err.message || err);
      if (retryCount < 1) {
        await new Promise((r) => setTimeout(r, 1000));
        return this.createAudioResource(retryCount + 1);
      }
      throw err;
    }
  }

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
    requestedBy: { username: string; avatarUrl?: string }
  ): Promise<Track[]> {
    const cleanInput = input.trim();

    // Handle Spotify URLs exclusively via Spotify API (never pass open.spotify.com to yt-dlp)
    if (SpotifyUtils.isSpotifyUrl(cleanInput)) {
      if (cleanInput.includes('/track/')) {
        const info = await SpotifyUtils.getTrackInfo(cleanInput);
        if (info) {
          return [new Track({
            title: `${info.title} - ${info.artist}`,
            url: info.url,
            duration: 0,
            durationString: '--:--',
            requestedBy,
            source: 'spotify'
          })];
        }
      } else if (cleanInput.includes('/playlist/')) {
        const tracks = await SpotifyUtils.getPlaylistTracks(cleanInput);
        if (tracks.length > 0) {
          return tracks.map(t => new Track({
            title: `${t.title} - ${t.artist}`,
            url: t.url,
            duration: 0,
            durationString: '--:--',
            requestedBy,
            source: 'spotify'
          }));
        }
      } else if (cleanInput.includes('/album/')) {
        const tracks = await SpotifyUtils.getAlbumTracks(cleanInput);
        if (tracks.length > 0) {
          return tracks.map(t => new Track({
            title: `${t.title} - ${t.artist}`,
            url: t.url,
            duration: 0,
            durationString: '--:--',
            requestedBy,
            source: 'spotify'
          }));
        }
      }
      throw new Error('Không thể lấy thông tin từ link Spotify này (vui lòng kiểm tra cấu hình SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET hoặc đảm bảo playlist ở chế độ công khai).');
    }

    // Handle direct URLs
    if (cleanInput.startsWith('http://') || cleanInput.startsWith('https://')) {
      try {
        logger.info(`Fetching metadata for direct URL: "${cleanInput}"`);
        const metadataList = await ytDlpGetMetadata(cleanInput);
        
        if (metadataList.length > 0) {
          return metadataList.map(item => new Track({
            title: item.title,
            url: item.url,
            thumbnail: item.thumbnail,
            duration: item.duration,
            durationString: item.durationString,
            requestedBy,
            source: 'youtube'
          }));
        }
      } catch (err: any) {
        logger.error(`Metadata fetch failed for URL "${cleanInput}":`, err.message || err);
      }
      throw new Error('Không thể lấy thông tin bài hát từ đường dẫn này.');
    }

    // Search query
    logger.info(`Searching YouTube for query: "${cleanInput}"`);
    try {
      const searchResults = await searchYouTube(cleanInput, 1);
      if (searchResults && searchResults.length > 0) {
        const v = searchResults[0];
        return [new Track({
          title: v.title,
          url: v.url,
          thumbnail: v.thumbnail,
          duration: v.duration,
          durationString: v.durationString,
          requestedBy,
          source: 'youtube'
        })];
      }
    } catch (err: any) {
      logger.error(`Search failed for query "${cleanInput}":`, err.message || err);
    }

    throw new Error('Không tìm thấy bài hát nào phù hợp cho yêu cầu này.');
  }
}
