import { pingCommand } from './ping.js';
import { helpCommand } from './help.js';
import { joinCommand } from './join.js';
import { leaveCommand } from './leave.js';
import { playCommand } from './play.js';
import { skipCommand } from './skip.js';
import { stopCommand } from './stop.js';
import { pauseCommand } from './pause.js';
import { resumeCommand } from './resume.js';
import { queueCommand } from './queue.js';
import { nowplayingCommand } from './nowplaying.js';
import { shuffleCommand } from './shuffle.js';
import { removeCommand } from './remove.js';
import { clearCommand } from './clear.js';
import { loopCommand } from './loop.js';
import { volumeCommand } from './volume.js';
import { voice247Command } from './247.js';
import { dashboardCommand } from './dashboard.js';

export const commands = [
  pingCommand,
  helpCommand,
  joinCommand,
  leaveCommand,
  playCommand,
  skipCommand,
  stopCommand,
  pauseCommand,
  resumeCommand,
  queueCommand,
  nowplayingCommand,
  shuffleCommand,
  removeCommand,
  clearCommand,
  loopCommand,
  volumeCommand,
  voice247Command,
  dashboardCommand
];

export const commandsMap = new Map(
  commands.map((cmd) => [cmd.data.name, cmd])
);
