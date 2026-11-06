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

/**
 * Inline Error messages into the log line. Cloudflare Workers Logs keep only
 * the stack frames of a logged Error object, dropping its message; viem's
 * shortMessage is used when present because its full message is very long.
 */
function formatArgs(args: unknown[]): unknown[] {
  return args.map((arg) => {
    if (arg instanceof Error) {
      const short = (arg as { shortMessage?: string }).shortMessage;
      return `${arg.name}: ${short ?? arg.message}`;
    }
    return arg;
  });
}

export function createLogger(component: string) {
  return {
    debug(message: string, ...args: unknown[]) {
      if (shouldLog('debug')) {
        console.debug(formatMessage('debug', component, message), ...formatArgs(args));
      }
    },
    info(message: string, ...args: unknown[]) {
      if (shouldLog('info')) {
        console.log(formatMessage('info', component, message), ...formatArgs(args));
      }
    },
    warn(message: string, ...args: unknown[]) {
      if (shouldLog('warn')) {
        console.warn(formatMessage('warn', component, message), ...formatArgs(args));
      }
    },
    error(message: string, ...args: unknown[]) {
      if (shouldLog('error')) {
        console.error(formatMessage('error', component, message), ...formatArgs(args));
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
