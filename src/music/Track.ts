import play from 'play-dl';
import { createAudioResource, AudioResource } from '@discordjs/voice';
import { TrackData } from '../types.js';
import { logger } from '../utils/logger.js';

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
        logger.info(`Searching YouTube equivalent for Spotify track: "${this.title}"...`);
        const searchResults = await play.search(this.title, { limit: 1 });
        if (searchResults && searchResults.length > 0) {
          finalUrl = searchResults[0].url;
          logger.info(`Found YouTube equivalent for Spotify: "${searchResults[0].title}" (${finalUrl})`);
        } else {
          throw new Error(`Could not find a YouTube equivalent for Spotify track: "${this.title}"`);
        }
      }

      // Stream the audio from the finalized URL
      const streamInfo = await play.stream(finalUrl, {
        quality: 2, // 2 = High quality audio stream
        seek: 0,
      });

      // Create and return the discord voice audio resource
      const resource = createAudioResource(streamInfo.stream, {
        inputType: streamInfo.type,
        metadata: this,
        inlineVolume: true,
      });

      return resource;
    } catch (err: any) {
      logger.error(`Error creating audio resource for "${this.title}" (Attempt ${retryCount + 1}/3):`, err);
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
    requestedBy: { username: string; avatarUrl?: string }
  ): Promise<Track[]> {
    const cleanInput = input.trim();
    const type = await play.validate(cleanInput);

    // 1. Playlists
    if (type === 'yt_playlist') {
      const playlist = await play.playlist_info(cleanInput, { incomplete: true });
      const videos = await playlist.all_videos();
      return videos.map((v) => new Track({
        title: v.title || 'Unknown YouTube Video',
        url: v.url,
        thumbnail: v.thumbnails[0]?.url || '',
        duration: v.durationInSec,
        durationString: v.durationRaw || '0:00',
        requestedBy,
        source: 'youtube'
      }));
    }

    if (type === 'sp_playlist' || type === 'sp_album') {
      const spotifyData = await play.spotify(cleanInput);
      const tracks = await (spotifyData as any).all_tracks();
      return tracks.map((t) => new Track({
        title: `${t.name} - ${t.artists.map((a) => a.name).join(', ')}`,
        url: t.url,
        thumbnail: '', // Spotify play-dl tracks don't always contain immediate thumbnails easily
        duration: t.durationInSec,
        durationString: new Date(t.durationInSec * 1000).toISOString().substr(14, 5),
        requestedBy,
        source: 'spotify'
      }));
    }

    // 2. Individual Tracks
    if (type === 'yt_video') {
      const videoInfo = await play.video_basic_info(cleanInput);
      const v = videoInfo.video_details;
      return [new Track({
        title: v.title || 'Unknown YouTube Video',
        url: v.url,
        thumbnail: v.thumbnails[0]?.url || '',
        duration: v.durationInSec,
        durationString: v.durationRaw || '0:00',
        requestedBy,
        source: 'youtube'
      })];
    }

    if (type === 'sp_track') {
      const spotifyTrack = await play.spotify(cleanInput);
      const t = spotifyTrack as any;
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

    if (type === 'so_track') {
      const soundcloudTrack = await play.soundcloud(cleanInput);
      const t = soundcloudTrack as any;
      return [new Track({
        title: t.name || 'Unknown SoundCloud Track',
        url: t.url,
        thumbnail: t.thumbnail || '',
        duration: Math.floor((t.duration || 0) / 1000),
        durationString: new Date(t.duration || 0).toISOString().substr(14, 5),
        requestedBy,
        source: 'soundcloud'
      })];
    }

    if (type === 'so_playlist') {
      const soundcloudPlaylist = await play.soundcloud(cleanInput);
      const tracks = await (soundcloudPlaylist as any).all_tracks();
      return tracks.map((t: any) => new Track({
        title: t.name || 'Unknown SoundCloud Track',
        url: t.url,
        thumbnail: t.thumbnail || '',
        duration: Math.floor((t.duration || 0) / 1000),
        durationString: new Date(t.duration || 0).toISOString().substr(14, 5),
        requestedBy,
        source: 'soundcloud'
      }));
    }

    // 3. Search query (fallback)
    logger.info(`Searching YouTube for query: "${cleanInput}"...`);
    const searchResults = await play.search(cleanInput, { limit: 1 });
    if (searchResults && searchResults.length > 0) {
      const v = searchResults[0];
      return [new Track({
        title: v.title || 'Unknown YouTube Video',
        url: v.url,
        thumbnail: v.thumbnails[0]?.url || '',
        duration: v.durationInSec,
        durationString: v.durationRaw || '0:00',
        requestedBy,
        source: 'youtube'
      })];
    }

    throw new Error('No tracks or search results found for the input provided.');
  }
}
