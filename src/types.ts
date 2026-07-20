/**
 * Types representing the music track, queue state, and system configurations.
 */

export interface TrackData {
  title: string;
  url: string;
  thumbnail?: string;
  duration: number; // in seconds
  durationString: string;
  requestedBy: {
    username: string;
    avatarUrl?: string;
  };
  source: 'youtube' | 'unknown' | 'spotify';
}

export interface QueueState {
  guildId: string;
  guildName: string;
  currentTrack: TrackData | null;
  tracks: TrackData[];
  previousTracks: TrackData[];
  isPlaying: boolean;
  isPaused: boolean;
  loopMode: 'off' | 'track' | 'queue';
  volume: number;
  is247: boolean;
  channelName: string | null;
  voiceChannelId: string | null;
  playbackDuration: number;
}

export interface BotStatus {
  online: boolean;
  username: string | null;
  avatarUrl: string | null;
  latency: number;
  guildsCount: number;
  uptime: number; // in seconds
  activePlayersCount: number;
  hasCookies: boolean;
  isConfigured: boolean;
}

export interface CommandInfo {
  name: string;
  description: string;
  options?: any[];
}
