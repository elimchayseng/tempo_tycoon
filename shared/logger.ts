type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function getConfiguredLevel(): LogLevel {
  const env = process.env.LOG_LEVEL?.toLowerCase();
  if (env && env in LOG_LEVELS) return env as LogLevel;
  return 'info';
}

let currentLevel = getConfiguredLevel();

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

function timestamp(): string {
  return new Date().toISOString();
}

function formatMessage(level: LogLevel, component: string, message: string): string {
  return `[${timestamp()}] [${level.toUpperCase()}] [${component}] ${message}`;
}

export function createLogger(component: string) {
  return {
    debug(message: string, ...args: unknown[]) {
      if (shouldLog('debug')) {
        console.debug(formatMessage('debug', component, message), ...args);
      }
    },
    info(message: string, ...args: unknown[]) {
      if (shouldLog('info')) {
        console.log(formatMessage('info', component, message), ...args);
      }
    },
    warn(message: string, ...args: unknown[]) {
      if (shouldLog('warn')) {
        console.warn(formatMessage('warn', component, message), ...args);
      }
    },
    error(message: string, ...args: unknown[]) {
      if (shouldLog('error')) {
        console.error(formatMessage('error', component, message), ...args);
      }
    },
  };
}

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

export function getLogLevel(): LogLevel {
  return currentLevel;
}
