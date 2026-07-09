import { Client } from 'discord.js';
import { registerReadyEvent } from './ready.js';
import { registerInteractionCreateEvent } from './interactionCreate.js';
import { registerVoiceStateUpdateEvent } from './voiceStateUpdate.js';

export function registerAllEvents(client: Client) {
  registerReadyEvent(client);
  registerInteractionCreateEvent(client);
  registerVoiceStateUpdateEvent(client);
}
