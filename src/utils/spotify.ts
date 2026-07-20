import SpotifyWebApi from 'spotify-web-api-node';
import { logger } from './logger.js';

let spotifyApi: SpotifyWebApi | null = null;
let tokenExpirationTime: number = 0;

async function getSpotifyApi(): Promise<SpotifyWebApi | null> {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return null;
  }

  if (!spotifyApi) {
    spotifyApi = new SpotifyWebApi({
      clientId: clientId,
      clientSecret: clientSecret,
    });
  }

  // Refresh token if expired
  if (Date.now() > tokenExpirationTime) {
    try {
      const data = await spotifyApi.clientCredentialsGrant();
      spotifyApi.setAccessToken(data.body['access_token']);
      tokenExpirationTime = Date.now() + (data.body['expires_in'] * 1000) - 60000;
      logger.info('Spotify Access Token refreshed');
    } catch (err) {
      logger.error('Error refreshing Spotify token:', err);
      return null;
    }
  }

  return spotifyApi;
}

export interface SpotifyTrackInfo {
  title: string;
  artist: string;
  url: string;
}

export const SpotifyUtils = {
  isSpotifyUrl(url: string): boolean {
    return /open\.spotify\.com\/(track|playlist|album)\//.test(url);
  },

  async getTrackInfo(url: string): Promise<SpotifyTrackInfo | null> {
    const api = await getSpotifyApi();
    if (!api) return null;

    const match = url.match(/track\/([a-zA-Z0-9]+)/);
    if (!match) return null;

    const trackId = match[1];
    try {
      const data = await api.getTrack(trackId);
      const track = data.body;
      return {
        title: track.name,
        artist: track.artists[0]?.name || 'Unknown Artist',
        url: url,
      };
    } catch (err) {
      logger.error('Error fetching Spotify track info:', err);
      return null;
    }
  },

  async getPlaylistTracks(url: string): Promise<SpotifyTrackInfo[]> {
    const api = await getSpotifyApi();
    if (!api) return [];

    const match = url.match(/playlist\/([a-zA-Z0-9]+)/);
    if (!match) return [];

    const playlistId = match[1];
    try {
      const tracks: SpotifyTrackInfo[] = [];
      let offset = 0;
      let limit = 100;
      let total = 1;

      while (offset < total && tracks.length < 500) { // Limit to 500 tracks to avoid timeout
        const data = await api.getPlaylistTracks(playlistId, { offset, limit });
        total = data.body.total;
        
        for (const item of data.body.items) {
          if (item.track) {
            tracks.push({
              title: item.track.name,
              artist: item.track.artists[0]?.name || 'Unknown Artist',
              url: `https://open.spotify.com/track/${item.track.id}`,
            });
          }
        }
        offset += limit;
      }
      return tracks;
    } catch (err) {
      logger.error('Error fetching Spotify playlist tracks:', err);
      return [];
    }
  },

  async getAlbumTracks(url: string): Promise<SpotifyTrackInfo[]> {
    const api = await getSpotifyApi();
    if (!api) return [];

    const match = url.match(/album\/([a-zA-Z0-9]+)/);
    if (!match) return [];

    const albumId = match[1];
    try {
      const data = await api.getAlbumTracks(albumId);
      return data.body.items.map(track => ({
        title: track.name,
        artist: track.artists[0]?.name || 'Unknown Artist',
        url: `https://open.spotify.com/track/${track.id}`,
      }));
    } catch (err) {
      logger.error('Error fetching Spotify album tracks:', err);
      return [];
    }
  }
};
