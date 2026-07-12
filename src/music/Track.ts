import { createAudioResource, AudioResource, StreamType } from '@discordjs/voice';
import { TrackData } from '../types.js';
import { logger } from '../utils/logger.js';
import play, { SpotifyTrack, SpotifyAlbum, SpotifyPlaylist, SoundCloudTrack } from 'play-dl';

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
   * Generates an AudioResource from this track's URL.
   * Leverages play-dl to get the best possible stream for each platform.
   */
  public async createAudioResource(retryCount = 0): Promise<AudioResource<Track>> {
    try {
      logger.info(`Creating audio resource for [${this.source.toUpperCase()}]: "${this.title}"`);
      
      let stream;
      let type: StreamType = StreamType.Arbitrary;

      if (this.source === 'soundcloud') {
        // Direct SoundCloud streaming
        const scStream = await play.stream(this.url);
        stream = scStream.stream;
        type = scStream.type;
      } else if (this.source === 'spotify') {
        // Spotify doesn't have direct streams, play-dl will search for it
        const spStream = await play.stream(this.url);
        stream = spStream.stream;
        type = spStream.type;
      } else {
        // YouTube or other
        const ytStream = await play.stream(this.url);
        stream = ytStream.stream;
        type = ytStream.type;
      }

      const resource = createAudioResource(stream, {
        inputType: type,
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
   * Parse arbitrary user input or URL into Track objects using play-dl
   */
  public static async from(
    input: string,
    requestedBy: { username: string; avatarUrl?: string },
    platform: string = 'youtube'
  ): Promise<Track[]> {
    const cleanInput = input.trim();
    const type = await play.validate(cleanInput);

    logger.info(`Validating input: "${cleanInput}" -> detected type: ${type} (requested platform: ${platform})`);

    // 1. Handle URL inputs (Automatic platform detection)
    if (type && type !== 'search') {
      // Spotify URL
      if (type.includes('sp_')) {
        try {
          if (play.is_expired()) await play.refreshToken();
        } catch (e) {
          logger.warn('Spotify token refresh failed, attempting to continue...');
        }

        if (type === 'sp_track') {
          const info = await play.spotify(cleanInput) as SpotifyTrack;
          const durationSec = Math.floor(info.durationInMs / 1000);
          return [new Track({
            title: `${info.name} - ${info.artists.map(a => a.name).join(', ')}`,
            url: info.url,
            thumbnail: info.thumbnail?.url || '',
            duration: durationSec,
            durationString: new Date(info.durationInMs).toISOString().substring(14, 19),
            requestedBy,
            source: 'spotify'
          })];
        } else if (type === 'sp_album' || type === 'sp_playlist') {
          const info = await play.spotify(cleanInput) as SpotifyAlbum | SpotifyPlaylist;
          const tracks = await info.all_tracks();
          return tracks.map(t => {
            const dSec = Math.floor(t.durationInMs / 1000);
            return new Track({
              title: `${t.name} - ${t.artists.map(a => a.name).join(', ')}`,
              url: t.url,
              thumbnail: t.thumbnail?.url || '',
              duration: dSec,
              durationString: new Date(t.durationInMs).toISOString().substring(14, 19),
              requestedBy,
              source: 'spotify'
            });
          });
        }
      }

      // SoundCloud URL
      if (type.includes('so_')) {
        if (type === 'so_track') {
          const info = await play.soundcloud(cleanInput) as SoundCloudTrack;
          const dSec = Math.floor(info.durationInMs / 1000);
          return [new Track({
            title: info.name,
            url: info.url,
            thumbnail: info.thumbnail,
            duration: dSec,
            durationString: new Date(info.durationInMs).toISOString().substring(14, 19),
            requestedBy,
            source: 'soundcloud'
          })];
        } else if (type === 'so_playlist') {
          const info = await play.soundcloud(cleanInput) as any;
          const tracks = await info.all_tracks();
          return tracks.map((t: any) => {
            const dSec = Math.floor(t.durationInMs / 1000);
            return new Track({
              title: t.name,
              url: t.url,
              thumbnail: t.thumbnail,
              duration: dSec,
              durationString: new Date(t.durationInMs).toISOString().substring(14, 19),
              requestedBy,
              source: 'soundcloud'
            });
          });
        }
      }

      // YouTube URL
      if (type.includes('yt_')) {
        if (type === 'yt_video') {
          const info = (await play.video_info(cleanInput)).video_details;
          return [new Track({
            title: info.title || 'Unknown Title',
            url: info.url,
            thumbnail: info.thumbnails[0].url,
            duration: info.durationInSec,
            durationString: info.durationRaw,
            requestedBy,
            source: 'youtube'
          })];
        } else if (type === 'yt_playlist') {
          const info = await play.playlist_info(cleanInput, { incomplete: true });
          const videos = await info.all_videos();
          return videos.map(t => new Track({
            title: t.title || 'Unknown Title',
            url: t.url,
            thumbnail: t.thumbnails[0].url,
            duration: t.durationInSec,
            durationString: t.durationRaw,
            requestedBy,
            source: 'youtube'
          }));
        }
      }
    }

    // 2. Handle Search Query (Strictly follow platform)
    logger.info(`Searching strictly on platform: ${platform} for query: "${cleanInput}"`);
    
    if (platform === 'spotify') {
      try {
        if (play.is_expired()) await play.refreshToken();
      } catch (e) {}
      const results = await play.search(cleanInput, { source: { spotify: 'track' }, limit: 1 });
      if (results.length > 0) {
        const t = results[0] as unknown as SpotifyTrack;
        const dSec = Math.floor(t.durationInMs / 1000);
        return [new Track({
          title: `${t.name} - ${t.artists.map(a => a.name).join(', ')}`,
          url: t.url,
          thumbnail: t.thumbnail?.url || '',
          duration: dSec,
          durationString: new Date(t.durationInMs).toISOString().substring(14, 19),
          requestedBy,
          source: 'spotify'
        })];
      }
    } else if (platform === 'soundcloud') {
      const results = await play.search(cleanInput, { source: { soundcloud: 'tracks' }, limit: 1 });
      if (results.length > 0) {
        const t = results[0] as unknown as SoundCloudTrack;
        const dSec = Math.floor(t.durationInMs / 1000);
        return [new Track({
          title: t.name,
          url: t.url,
          thumbnail: t.thumbnail,
          duration: dSec,
          durationString: new Date(t.durationInMs).toISOString().substring(14, 19),
          requestedBy,
          source: 'soundcloud'
        })];
      }
    } else {
      // Default to YouTube search
      const results = await play.search(cleanInput, { source: { youtube: 'video' }, limit: 1 });
      if (results.length > 0) {
        const v = results[0];
        return [new Track({
          title: v.title || 'Unknown Title',
          url: v.url,
          thumbnail: v.thumbnails[0].url,
          duration: v.durationInSec,
          durationString: v.durationRaw,
          requestedBy,
          source: 'youtube'
        })];
      }
    }

    throw new Error(`Không tìm thấy bài hát nào trên nền tảng ${platform.toUpperCase()} cho yêu cầu này.`);
  }
}
