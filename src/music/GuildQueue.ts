import { 
  Message, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle 
} from 'discord.js';
import {
  AudioPlayer,
  AudioPlayerStatus,
  createAudioPlayer,
  VoiceConnection,
  VoiceConnectionStatus,
  VoiceConnectionDisconnectReason,
  entersState,
  AudioResource,
  createAudioResource,
} from '@discordjs/voice';
import play from 'play-dl';
import { Track } from './Track.js';
import { QueueState } from '../types.js';
import { logger } from '../utils/logger.js';
import { YouTubeSearch, searchYouTube } from '../utils/youtube-search.js';
import { getBotClient } from './bot-client.js';

export class GuildQueue {
  public readonly guildId: string;
  public readonly guildName: string;
  public connection: VoiceConnection;
  public readonly player: AudioPlayer;
  
  public tracks: Track[] = [];
  public previousTracks: Track[] = [];
  public currentTrack: Track | null = null;
  public currentResource: AudioResource<Track> | null = null;
  
  public loopMode: 'off' | 'track' | 'queue' = 'off';
  public volume = 100;
  public is247 = false;
  public autoplay = false;
  public voiceChannelId: string;
  public channelName = '';
  public textChannelId?: string;
  
  private isDisconnecting = false;
  private reconnectTimeout?: NodeJS.Timeout;

  private nowPlayingMessage: Message | null = null;
  public playbackDuration = 0;
  private isProcessing = false;
  private playbackInterval: NodeJS.Timeout | null = null;
  
  private isTransitioningPrevious = false;
  private readonly onDestroy?: () => void;
  
  constructor(
    guildId: string,
    guildName: string,
    connection: VoiceConnection,
    voiceChannelId: string,
    channelName: string,
    textChannelId?: string,
    onDestroy?: () => void
  ) {
    this.guildId = guildId;
    this.guildName = guildName;
    this.connection = connection;
    this.voiceChannelId = voiceChannelId;
    this.channelName = channelName;
    this.textChannelId = textChannelId;
    this.onDestroy = onDestroy;

    this.player = createAudioPlayer();
    this.connection.subscribe(this.player);

    this.setupPlayerListeners();
    this.setupConnectionListeners();
    
    // Start tracking duration
    this.playbackInterval = setInterval(() => {
      if (this.player.state.status === AudioPlayerStatus.Playing && this.currentResource) {
        this.playbackDuration = Math.floor(this.currentResource.playbackDuration / 1000);
      } else if (this.player.state.status === AudioPlayerStatus.Idle) {
        this.playbackDuration = 0;
      }
    }, 500);
  }

  public async setNowPlayingMessage(message: Message | null): Promise<void> {
    if (this.nowPlayingMessage) {
      try {
        await this.nowPlayingMessage.delete();
      } catch (error) {
        logger.error('Failed to delete previous now playing message:', error);
      }
    }
    this.nowPlayingMessage = message;
  }



  /**
   * Set up voice connection status listeners to handle disconnects and reconnects gracefully.
   */
  private setupConnectionListeners() {
    this.connection.on('stateChange', async (oldState, newState) => {
      logger.info(`Voice Connection State: ${oldState.status} -> ${newState.status} in "${this.guildName}"`);

      if (newState.status === VoiceConnectionStatus.Disconnected) {
        if (newState.reason === VoiceConnectionDisconnectReason.Manual) {
          // Manual disconnect, clean up immediately
          logger.music(`Manual disconnect from "${this.guildName}" voice channel.`, 'disconnected');
          this.destroy();
        } else if (this.connection.rejoinAttempts < 5) {
          // Automatic reconnect if kicked or connection dropped
          logger.music(`Disconnected due to network issue. Retrying connection in 2 seconds...`, 'reconnect');
          
          if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
          this.reconnectTimeout = setTimeout(() => {
            try {
              this.connection.rejoin();
            } catch (err) {
              logger.error(`Failed to rejoin voice connection in "${this.guildName}":`, err);
            }
          }, 2000);
        } else {
          logger.music(`Max rejoin attempts exceeded. Cleaning up voice queue for "${this.guildName}".`, 'disconnected');
          this.destroy();
        }
      } else if (newState.status === VoiceConnectionStatus.Destroyed) {
        this.destroy();
      } else if (newState.status === VoiceConnectionStatus.Connecting || newState.status === VoiceConnectionStatus.Signalling) {
        // Prevent voice connection freeze during signallings
        try {
          await entersState(this.connection, VoiceConnectionStatus.Ready, 15_000);
        } catch (err) {
          if (this.connection.state.status !== VoiceConnectionStatus.Destroyed) {
            logger.error(`Voice channel signaling timed out for "${this.guildName}". Destroying connection.`, err);
            this.connection.destroy();
          }
        }
      }
    });
  }

  /**
   * Set up audio player event listeners (e.g. play next track when idle, catch stream errors).
   */
  private setupPlayerListeners() {
    // When the track ends, automatically transition
    this.player.on(AudioPlayerStatus.Idle, () => {
      logger.music(`Track finished in "${this.guildName}". Transitioning.`, 'idle');
      this.handleTrackFinished();
    });

    // Handle stream errors gracefully to prevent crashing and retry playing the next track
    this.player.on('error', (error) => {
      logger.error(`Audio player stream error in "${this.guildName}":`, error);
      // Skip the corrupted track and play next
      this.handleTrackFinished();
    });
  }

  /**
   * Play the current track at the top of the queue or continue playing
   */
  public async play(): Promise<void> {
    if (this.isProcessing) return;
    
    try {
      if (this.player.state.status === AudioPlayerStatus.Paused) {
        this.player.unpause();
        logger.music(`Unpaused music queue in "${this.guildName}"`, 'resume');
        return;
      }

      if (this.tracks.length === 0) {
        logger.music(`Queue is empty for "${this.guildName}". Play skipped.`, 'info');
        this.startIdleLeaveTimer();
        return;
      }

      this.isProcessing = true;
      this.currentTrack = this.tracks[0];
      await this.playTrack(this.currentTrack);
    } catch (err) {
      logger.error('Error in play():', err);
      this.isProcessing = false;
      this.handleTrackFinished(); // Try next
    } finally {
      this.isProcessing = false;
    }
  }

  private async playTrack(track: Track): Promise<void> {
    if (!this.currentTrack) return;
    
    try {
      this.playbackDuration = 0;
      logger.music(`Generating stream for: "${this.currentTrack.title}"`, 'play');
      
      const resource = await this.currentTrack.createAudioResource();
      this.currentResource = resource;
      
      // Set volume
      this.setVolume(this.volume);
      
      this.player.play(resource);
      logger.success(`Now playing "${this.currentTrack.title}" in "${this.guildName}"`);

      // Delete the old "now playing" message first
      await this.setNowPlayingMessage(null);

      // Post the new "Now Playing" embed with control buttons
      try {
        const client = getBotClient();
        if (client && this.textChannelId) {
          const channel = client.channels.cache.get(this.textChannelId) || await client.channels.fetch(this.textChannelId).catch(() => null);
          if (channel && channel.isTextBased()) {
            const track = this.currentTrack;
            const color = track.source === 'spotify' ? 0x1DB954 : (track.source === 'soundcloud' ? 0xFF5500 : 0xFF0000);

            const embed = new EmbedBuilder()
              .setColor(color)
              .setAuthor({ 
                name: '🎶 Đang phát ngay bây giờ', 
                iconURL: track.requestedBy.avatarUrl 
              })
              .setTitle(track.title)
              .setURL(track.url)
              .setDescription(`⏱️ \`${track.durationString}\``)
              .addFields(
                { name: 'Yêu cầu bởi', value: `👤 ${track.requestedBy.username}`, inline: true },
                { name: 'Nguồn', value: `🔌 ${track.source.toUpperCase()}`, inline: true }
              );

            if (track.thumbnail) {
              embed.setThumbnail(track.thumbnail);
            }

            const row1 = new ActionRowBuilder<ButtonBuilder>()
              .addComponents(
                new ButtonBuilder().setCustomId('control_previous').setLabel('⏮️').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('control_pause_resume').setLabel('⏸️/▶️').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('control_skip').setLabel('⏭️').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('control_loop').setLabel('🔁').setStyle(ButtonStyle.Secondary)
              );

            const row2 = new ActionRowBuilder<ButtonBuilder>()
              .addComponents(
                new ButtonBuilder().setCustomId('control_volume_down').setLabel('🔉').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('control_volume_up').setLabel('🔊').setStyle(ButtonStyle.Secondary)
              );

            const msg = await (channel as any).send({ embeds: [embed], components: [row1, row2] });
            this.nowPlayingMessage = msg;
          }
        }
      } catch (msgErr) {
        logger.error('Failed to send Now Playing embed to channel:', msgErr);
      }
    } catch (err: any) {
      logger.error(`Error initiating playback in "${this.guildName}":`, err);
      // If playing fails, shift and play next
      this.tracks.shift();
      this.play();
    }
  }

  /**
   * Handle transitions when a song completes
   */
  private async handleTrackFinished() {
    if (!this.currentTrack) return;
    
    // Clear the now playing message
    await this.setNowPlayingMessage(null);

    if (this.isTransitioningPrevious) {
      this.isTransitioningPrevious = false;
      this.play();
      return;
    }

    // Save to previous tracks
    this.previousTracks.push(this.currentTrack);
    if (this.previousTracks.length > 20) this.previousTracks.shift();

    if (this.loopMode === 'track') {
      // Re-play the same track
      logger.music(`Loop active (track): re-playing "${this.currentTrack.title}"`, 'loop');
      this.play();
    } else if (this.loopMode === 'queue') {
      // Move current track to bottom of queue
      const played = this.tracks.shift();
      if (played) this.tracks.push(played);
      
      if (this.tracks.length > 0) {
        this.play();
      } else {
        this.currentTrack = null;
        this.currentResource = null;
      }
    } else {
      // Normal: play next
      this.tracks.shift();
      
      if (this.tracks.length > 0) {
        this.play();
      } else if (this.autoplay) {
        // Queue ended, attempt autoplay fetch
        await this.handleAutoplay();
      } else {
        // Queue truly ended
        this.currentTrack = null;
        this.currentResource = null;
        logger.music(`Queue ended for "${this.guildName}".`, 'ended');
        
        // If 24/7 mode is false, set timer to leave channel in 2 minutes
        if (!this.is247) {
          logger.info(`Starting 2-minute idle leave timer for "${this.guildName}"`);
          this.startIdleLeaveTimer();
        }
      }
    }
  }

  private idleTimer?: NodeJS.Timeout;

  private startIdleLeaveTimer() {
    this.clearIdleLeaveTimer();
    this.idleTimer = setTimeout(() => {
      if (this.tracks.length === 0 && !this.currentTrack && !this.is247) {
        logger.music(`Left voice channel due to inactivity in "${this.guildName}"`, 'idle_leave');
        this.connection.destroy();
      }
    }, 120_000); // 2 minutes
  }

  private clearIdleLeaveTimer() {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = undefined;
    }
  }

  /**
   * Search for related videos of the last played song and queue one
   */
  private async handleAutoplay(): Promise<void> {
    const lastTrack = this.previousTracks[this.previousTracks.length - 1];
    if (!lastTrack) return;

    try {
      logger.music(`Autoplay active: searching recommendations based on "${lastTrack.title}"...`, 'autoplay');
      
      // play-dl search for related content
      let searchResult: any[] = [];
      try {
        const results = await searchYouTube(lastTrack.title, 5, 'youtube');
        searchResult = results.map(v => ({
          title: v.title,
          url: v.url,
          thumbnails: v.thumbnail ? [{ url: v.thumbnail }] : [],
          durationInSec: v.duration,
          durationRaw: v.durationString
        }));
      } catch (err) {
        logger.warn(`searchYouTube failed in autoplay...`, err);
      }
      
      const related = searchResult.filter(v => v.url !== lastTrack.url && (v.durationInSec || 0) > 30);
      
      if (related && related.length > 0) {
        // Queue the first recommended video
        const recommendedVideo = related[0];
        const newTrack = new Track({
          title: recommendedVideo.title || 'Recommended Track',
          url: recommendedVideo.url,
          thumbnail: recommendedVideo.thumbnails[0]?.url || '',
          duration: recommendedVideo.durationInSec,
          durationString: recommendedVideo.durationRaw || '0:00',
          requestedBy: { username: 'Autoplay Recommendations' },
          source: 'youtube',
        });

        this.tracks.push(newTrack);
        logger.music(`Autoplay added: "${newTrack.title}"`, 'autoplay');
        this.play();
      } else {
        logger.warn(`No autoplay recommendations found for "${lastTrack.title}".`);
        this.currentTrack = null;
        this.currentResource = null;
      }
    } catch (err: any) {
      logger.error('Failed to resolve autoplay recommendations:', err);
      this.currentTrack = null;
      this.currentResource = null;
    }
  }

  /**
   * Add a list of tracks to the queue. Automatically plays if nothing is playing.
   */
  public async addTracks(newTracks: Track[]): Promise<void> {
    this.clearIdleLeaveTimer();
    this.tracks.push(...newTracks);
    
    if (this.player.state.status === AudioPlayerStatus.Idle && !this.isProcessing) {
      await this.play();
    }
  }

  /**
   * Skips the current song
   */
  public skip(): boolean {
    if (!this.currentTrack) return false;
    logger.music(`Skipping: "${this.currentTrack.title}"`, 'skip');
    
    // Stop the player; our idle/finish listener will trigger playing the next track
    this.player.stop();
    return true;
  }

  /**
   * Pause song playback
   */
  public pause(): boolean {
    if (this.player.state.status === AudioPlayerStatus.Paused) return false;
    this.player.pause();
    logger.music(`Paused music playback in "${this.guildName}"`, 'pause');
    return true;
  }

  /**
   * Resume song playback
   */
  public resume(): boolean {
    if (this.player.state.status !== AudioPlayerStatus.Paused) return false;
    this.player.unpause();
    logger.music(`Resumed music playback in "${this.guildName}"`, 'resume');
    return true;
  }

  /**
   * Previous track recovery
   */
  public previous(): boolean {
    if (this.previousTracks.length === 0) return false;
    const lastTrack = this.previousTracks.pop();
    if (!lastTrack) return false;

    logger.music(`Re-playing previous track: "${lastTrack.title}"`, 'previous');
    
    this.isTransitioningPrevious = true;
    
    // Put current track (if playing) back into queue at the second position
    if (this.currentTrack) {
      this.tracks.unshift(lastTrack, this.currentTrack);
    } else {
      this.tracks.unshift(lastTrack);
    }

    this.player.stop(); // Stops current song, immediately runs the previous song
    return true;
  }

  /**
   * Sets the volume (0 to 100)
   */
  public setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(100, vol));
    logger.music(`setVolume called with ${vol}%, currentResource.volume: ${!!this.currentResource?.volume}`, 'volume');
    if (this.currentResource?.volume) {
      // AudioResource volume is scale 0-1, linear or logarithmic
      this.currentResource.volume.setVolume(this.volume / 100);
      logger.music(`Volume set to ${this.volume}% in "${this.guildName}"`, 'volume');
    }
  }

  /**
   * Shuffles current queue tracks
   */
  public shuffle(): void {
    if (this.tracks.length <= 1) return;
    
    // Keep first track intact (since it is the currently playing track in standard design)
    // and shuffle the remainder
    const [playing, ...remaining] = this.tracks;
    
    for (let i = remaining.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
    }
    
    this.tracks = [playing, ...remaining];
    logger.music(`Shuffled music queue for "${this.guildName}"`, 'shuffle');
  }

  /**
   * Remove a track at index (1-based index from the remaining queue list)
   */
  public removeTrack(index: number): Track | null {
    if (index <= 0 || index >= this.tracks.length) return null;
    const removed = this.tracks.splice(index, 1)[0];
    if (removed) {
      logger.music(`Removed track "${removed.title}" from queue index ${index} in "${this.guildName}"`, 'remove');
    }
    return removed;
  }

  /**
   * Clear all tracks in the queue (except the current one)
   */
  public clear(): void {
    if (this.tracks.length > 1) {
      this.tracks = this.currentTrack ? [this.currentTrack] : [];
      logger.music(`Cleared music queue (except current song) in "${this.guildName}"`, 'clear');
    } else {
      this.tracks = [];
    }
  }

  /**
   * Completely stop playback and reset state
   */
  public stop(): void {
    logger.music(`Stopping playback and clearing queue in "${this.guildName}"`, 'stop');
    this.tracks = [];
    this.previousTracks = [];
    this.currentTrack = null;
    this.currentResource = null;
    this.player.stop();
    this.clearIdleLeaveTimer();
  }

  /**
   * Set 24/7 standby mode
   */
  public set247(enable: boolean): void {
    this.is247 = enable;
    if (enable) {
      this.clearIdleLeaveTimer();
      logger.music(`24/7 mode enabled in "${this.guildName}"`, '247');
    } else {
      logger.music(`24/7 mode disabled in "${this.guildName}"`, '247');
      if (this.tracks.length === 0 && !this.currentTrack) {
        this.startIdleLeaveTimer();
      }
    }
  }

  /**
   * Set Autoplay mode
   */
  public setAutoplay(enable: boolean): void {
    this.autoplay = enable;
    logger.music(`Autoplay ${enable ? 'enabled' : 'disabled'} in "${this.guildName}"`, 'autoplay');
  }

  /**
   * Seek playback (if play-dl seek is possible by re-requesting stream)
   */
  public async seek(seconds: number): Promise<boolean> {
    if (!this.currentTrack) return false;
    
    try {
      logger.music(`Seeking to ${seconds} seconds for: "${this.currentTrack.title}"`, 'seek');
      
      const streamInfo = await play.stream(this.currentTrack.url, {
        quality: 2,
        seek: seconds,
      });

      const resource = createAudioResource(streamInfo.stream, {
        inputType: streamInfo.type,
        metadata: this.currentTrack,
        inlineVolume: true,
      });

      this.currentResource = resource;
      if (resource.volume) {
        resource.volume.setVolume(this.volume / 100);
      }

      this.player.play(resource);
      return true;
    } catch (err) {
      logger.error(`Error seeking stream:`, err);
      return false;
    }
  }

  /**
   * Cleanly tear down the player and voice connection
   */
  public destroy(): void {
    if (this.isDisconnecting) return;
    this.isDisconnecting = true;
    
    logger.music(`Destroying GuildQueue for "${this.guildName}"`, 'destroy');
    this.clearIdleLeaveTimer();
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    if (this.playbackInterval) clearInterval(this.playbackInterval);
    this.playbackDuration = 0;
    
    this.tracks = [];
    this.previousTracks = [];
    this.currentTrack = null;
    this.currentResource = null;

    try {
      this.player.stop();
    } catch {}

    try {
      if (this.connection.state.status !== VoiceConnectionStatus.Destroyed) {
        this.connection.destroy();
      }
    } catch {}

    if (this.onDestroy) {
      this.onDestroy();
    }
  }

  /**
   * Serialize Queue state for Web Panel APIs
   */
  public getQueueState(): QueueState {
    return {
      guildId: this.guildId,
      guildName: this.guildName,
      currentTrack: this.currentTrack ? this.currentTrack.toJSON() : null,
      tracks: this.tracks.map((t) => t.toJSON()),
      previousTracks: this.previousTracks.map((t) => t.toJSON()),
      isPlaying: this.player.state.status === AudioPlayerStatus.Playing,
      isPaused: this.player.state.status === AudioPlayerStatus.Paused,
      loopMode: this.loopMode,
      volume: this.volume,
      autoplay: this.autoplay,
      is247: this.is247,
      channelName: this.channelName,
      voiceChannelId: this.voiceChannelId,
      playbackDuration: this.playbackDuration,
    };
  }
}
