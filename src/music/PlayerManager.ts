import { VoiceConnection } from '@discordjs/voice';
import { GuildQueue } from './GuildQueue.js';
import { logger } from '../utils/logger.js';
import { QueueState } from '../types.js';

export class PlayerManager {
  private static instance: PlayerManager;
  private queues: Map<string, GuildQueue> = new Map();

  private constructor() {
    // Singleton pattern
  }

  public static getInstance(): PlayerManager {
    if (!PlayerManager.instance) {
      PlayerManager.instance = new PlayerManager();
    }
    return PlayerManager.instance;
  }

  /**
   * Retrieves an active guild queue.
   */
  public get(guildId: string): GuildQueue | undefined {
    logger.info(`PlayerManager.get called for guildId: ${guildId}. Queues size: ${this.queues.size}`);
    return this.queues.get(guildId);
  }

  /**
   * Checks if an active guild queue exists.
   */
  public has(guildId: string): boolean {
    return this.queues.has(guildId);
  }

  /**
   * Creates and registers a new GuildQueue.
   */
  public create(
    guildId: string,
    guildName: string,
    connection: VoiceConnection,
    voiceChannelId: string,
    channelName: string,
    textChannelId?: string
  ): GuildQueue {
    logger.info(`PlayerManager.create called for guildId: ${guildId}, guildName: ${guildName}`);
    // If existing queue exists, destroy it first
    const existing = this.queues.get(guildId);
    if (existing) {
      logger.warn(`GuildQueue already exists for guild "${guildName}" (${guildId}). Destroying first.`);
      existing.destroy();
    }

    const queue = new GuildQueue(
      guildId,
      guildName,
      connection,
      voiceChannelId,
      channelName,
      textChannelId,
      () => {
        this.queues.delete(guildId);
        logger.info(`Removed GuildQueue reference from PlayerManager for guild: ${guildId}`);
      }
    );

    this.queues.set(guildId, queue);
    logger.success(`Created GuildQueue for guild "${guildName}" (${guildId}) in voice: "${channelName}"`);
    return queue;
  }

  /**
   * Cleans up and deletes a GuildQueue.
   */
  public delete(guildId: string): boolean {
    const queue = this.queues.get(guildId);
    if (queue) {
      queue.destroy();
      this.queues.delete(guildId);
      logger.info(`Deleted GuildQueue for guild: ${guildId}`);
      return true;
    }
    return false;
  }

  /**
   * Return a count of all active voice connections
   */
  public get activeCount(): number {
    return this.queues.size;
  }

  /**
   * List state details of all active players
   */
  public listStates(): QueueState[] {
    const states: QueueState[] = [];
    for (const [_, queue] of this.queues) {
      try {
        states.push(queue.getQueueState());
      } catch (err) {
        logger.error(`Error serializing queue state for guild: ${queue.guildId}`, err);
      }
    }
    return states;
  }
}

export const playerManager = PlayerManager.getInstance();
