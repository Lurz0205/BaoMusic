/**
 * Custom console logger with clean ANSI colors.
 */

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  underscore: '\x1b[4m',
  blink: '\x1b[5m',
  reverse: '\x1b[7m',
  hidden: '\x1b[8m',
  
  fgBlack: '\x1b[30m',
  fgRed: '\x1b[31m',
  fgGreen: '\x1b[32m',
  fgYellow: '\x1b[33m',
  fgBlue: '\x1b[34m',
  fgMagenta: '\x1b[35m',
  fgCyan: '\x1b[36m',
  fgWhite: '\x1b[37m',
  
  bgBlack: '\x1b[40m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgCyan: '\x1b[46m',
  bgWhite: '\x1b[47m',
};

export const logger = {
  info: (message: string, prefix = 'INFO') => {
    console.log(`${colors.fgCyan}[${prefix}]${colors.reset} ${message}`);
  },
  
  success: (message: string, prefix = 'SUCCESS') => {
    console.log(`${colors.fgGreen}[${prefix}]${colors.reset} ${message}`);
  },
  
  warn: (message: string, prefix = 'WARN') => {
    console.warn(`${colors.fgYellow}[${prefix}]${colors.reset} ${message}`);
  },
  
  error: (message: string, error?: any, prefix = 'ERROR') => {
    console.error(`${colors.fgRed}[${prefix}]${colors.reset} ${message}`);
    if (error) {
      console.error(error);
    }
  },
  
  music: (message: string, action: string) => {
    console.log(
      `${colors.fgMagenta}[MUSIC]${colors.reset} ${colors.fgBlue}${action.toUpperCase()}${colors.reset} - ${message}`
    );
  },

  bot: (message: string) => {
    console.log(`${colors.bright}${colors.fgGreen}[BOT]${colors.reset} ${message}`);
  }
};
