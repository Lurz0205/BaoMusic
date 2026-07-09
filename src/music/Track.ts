import play from 'play-dl';
import { createAudioResource, AudioResource } from '@discordjs/voice';
import { TrackData } from '../types.js';
import { logger } from '../utils/logger.js';
import { YouTubeSearch } from '../utils/youtube-search.js';
import ytdl from '@distube/ytdl-core';
import { getYtdlAgent } from '../utils/playdl-init.js';

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
        let youtubeUrl: string | null = null;
        try {
          const searchResults = await play.search(this.title, { limit: 1 });
          if (searchResults && searchResults.length > 0) {
            youtubeUrl = searchResults[0].url;
            logger.info(`Found YouTube equivalent for Spotify (via play-dl): "${searchResults[0].title}" (${youtubeUrl})`);
          }
        } catch (err) {
          logger.warn(`play-dl search failed for Spotify conversion, falling back to YouTubeSearch...`, err);
          try {
            const video = await YouTubeSearch.searchOne(this.title);
            if (video) {
              youtubeUrl = video.url;
              logger.info(`Found YouTube equivalent for Spotify (via YouTubeSearch): "${video.title}" (${youtubeUrl})`);
            }
          } catch (subErr: any) {
            logger.error(`YouTubeSearch search also failed for Spotify conversion:`, subErr.message || subErr);
          }
        }

        if (youtubeUrl) {
          finalUrl = youtubeUrl;
        } else {
          throw new Error(`Could not find a YouTube equivalent for Spotify track: "${this.title}"`);
        }
      }

      // Stream the audio from the finalized URL
      let resource;
      try {
        logger.info(`Attempting to stream "${this.title}" using play-dl...`);
        const streamInfo = await play.stream(finalUrl, {
          quality: 2, // 2 = High quality audio stream
          seek: 0,
        });

        resource = createAudioResource(streamInfo.stream, {
          inputType: streamInfo.type,
          metadata: this,
          inlineVolume: true,
        });
      } catch (playDlError: any) {
        logger.warn(`play-dl stream failed for "${this.title}": ${playDlError.message || playDlError}. Falling back to @distube/ytdl-core...`);
        
        try {
          const agent = getYtdlAgent();
          const ytdlStream = ytdl(finalUrl, {
            filter: 'audioonly',
            quality: 'highestaudio',
            highWaterMark: 1 << 25, // 32MB buffer size for extremely smooth playback
            agent
          });
          
          resource = createAudioResource(ytdlStream, {
            metadata: this,
            inlineVolume: true,
          });
          logger.success(`Successfully generated fallback stream with @distube/ytdl-core for "${this.title}"`);
        } catch (ytdlError: any) {
          logger.error(`Both play-dl and @distube/ytdl-core failed to stream "${this.title}":`, ytdlError.message || ytdlError);
          throw ytdlError;
        }
      }

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
    requestedBy: { username: string; avatarUrl?: string }
  ): Promise<Track[]> {
    const cleanInput = input.trim();
    let type: any = false;
    try {
      type = await play.validate(cleanInput);
    } catch (err: any) {
      logger.warn(`play.validate failed for input "${cleanInput}", falling back:`, err.message || err);
    }

    // Fallback: If play-dl did not validate or failed, check if it's a valid YouTube URL via ytdl-core
    if (!type && ytdl.validateURL(cleanInput)) {
      try {
        logger.info(`Validating YouTube URL using @distube/ytdl-core: "${cleanInput}"...`);
        const agent = getYtdlAgent();
        const info = await ytdl.getBasicInfo(cleanInput, { agent });
        const v = info.videoDetails;
        const durationSec = parseInt(v.lengthSeconds || '0', 10);
        return [new Track({
          title: v.title || 'Unknown YouTube Video',
          url: v.video_url,
          thumbnail: v.thumbnails[0]?.url || '',
          duration: durationSec,
          durationString: new Date(durationSec * 1000).toISOString().substr(14, 5),
          requestedBy,
          source: 'youtube'
        })];
      } catch (ytdlErr: any) {
        logger.warn(`@distube/ytdl-core URL parsing failed for "${cleanInput}":`, ytdlErr.message || ytdlErr);
      }
    }

    // 1. Playlists
    if (type === 'yt_playlist') {
      try {
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
      } catch (err: any) {
        logger.error(`Failed to parse YouTube playlist with play-dl:`, err.message || err);
        throw new Error(`Không thể tải playlist YouTube (Lỗi bot hoặc cookie hết hạn). Chi tiết: ${err.message || err}`);
      }
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
      try {
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
      } catch (err: any) {
        logger.warn(`play-dl video_basic_info failed for "${cleanInput}", falling back to @distube/ytdl-core:`, err.message || err);
        try {
          const agent = getYtdlAgent();
          const info = await ytdl.getBasicInfo(cleanInput, { agent });
          const v = info.videoDetails;
          const durationSec = parseInt(v.lengthSeconds || '0', 10);
          
          // format durationString safely
          let durationString = '0:00';
          if (durationSec > 0) {
            const dateStr = new Date(durationSec * 1000).toISOString();
            durationString = durationSec >= 3600 ? dateStr.substr(11, 8) : dateStr.substr(14, 5);
          }

          return [new Track({
            title: v.title || 'Unknown YouTube Video',
            url: v.video_url,
            thumbnail: v.thumbnails[0]?.url || '',
            duration: durationSec,
            durationString,
            requestedBy,
            source: 'youtube'
          })];
        } catch (subErr: any) {
          logger.error(`Both play-dl and @distube/ytdl-core failed to get video info for "${cleanInput}":`, subErr.message || subErr);
          throw subErr;
        }
      }
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
    try {
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
    } catch (err) {
      logger.warn(`play-dl search failed, falling back to YouTubeSearch...`, err);
      try {
        const video = await YouTubeSearch.searchOne(cleanInput);
        if (video) {
          return [new Track({
            title: video.title || 'Unknown YouTube Video',
            url: video.url,
            thumbnail: video.thumbnail?.url || '',
            duration: Math.floor(video.duration / 1000),
            durationString: video.durationFormatted || '0:00',
            requestedBy,
            source: 'youtube'
          })];
        }
      } catch (subErr: any) {
        logger.error(`Both play-dl and YouTubeSearch searches failed:`, subErr.message || subErr);
      }
    }

    throw new Error('No tracks or search results found for the input provided.');
  }
}
