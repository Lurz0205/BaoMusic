import { createAudioResource, AudioResource, StreamType } from '@discordjs/voice';
import { TrackData } from '../types.js';
import { logger } from '../utils/logger.js';
import { ytDlpGetMetadata, searchYouTube, spawnStream } from '../utils/youtube-search.js';

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
  public readonly source: 'youtube' | 'unknown';

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
   * Generates an AudioResource from this track's URL using yt-dlp.
   */
  public async createAudioResource(retryCount = 0): Promise<AudioResource<Track>> {
    try {
      logger.info(`Creating audio stream via yt-dlp for: "${this.title}" (${this.url})`);
      const stream = await spawnStream(this.url);

      const resource = createAudioResource(stream, {
        inputType: StreamType.Arbitrary,
        metadata: this,
        inlineVolume: true,
      });

      return resource;
    } catch (err: any) {
      logger.error(`Error creating audio resource for "${this.title}" (Attempt ${retryCount + 1}/3):`, err.message || err);
      if (retryCount < 2) {
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
   * Parse arbitrary user input or URL into Track objects using yt-dlp
   */
  public static async from(
    input: string,
    requestedBy: { username: string; avatarUrl?: string }
  ): Promise<Track[]> {
    const cleanInput = input.trim();

    // Handle direct URLs
    if (cleanInput.startsWith('http://') || cleanInput.startsWith('https://')) {
      try {
        logger.info(`Fetching metadata via yt-dlp for direct URL: "${cleanInput}"`);
        const metadataList = await ytDlpGetMetadata(cleanInput);
        
        return metadataList.map(item => new Track({
          title: item.title,
          url: item.url,
          thumbnail: item.thumbnail,
          duration: item.duration,
          durationString: item.durationString,
          requestedBy,
          source: 'youtube'
        }));
      } catch (err: any) {
        logger.error(`yt-dlp metadata fetch failed for URL "${cleanInput}":`, err.message || err);
        throw new Error(`Không thể lấy thông tin bài hát từ YouTube. Hãy đảm bảo bạn đã tải lên cookie.txt mới nhất từ Dashboard.`);
      }
    }

    // Search query
    logger.info(`Searching YouTube via yt-dlp for query: "${cleanInput}"`);
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
      logger.error(`yt-dlp search failed for query "${cleanInput}":`, err.message || err);
    }

    throw new Error('Không tìm thấy bài hát nào trên YouTube cho yêu cầu này.');
  }
}
