import pino from 'pino';

type LogSinkFn = (level: string, name: string, msg: string, data?: string) => void;
let _logSink: LogSinkFn | null = null;

/** Set a global sink that receives every log entry (call after DB init) */
export function setLogSink(sink: LogSinkFn): void {
  _logSink = sink;
}

const LEVEL_NAMES: Record<number, string> = {
  10: 'trace',
  20: 'debug',
  30: 'info',
  40: 'warn',
  50: 'error',
  60: 'fatal',
};

export function createLogger(name: string, level?: string): pino.Logger {
  return pino({
    name,
    level: level ?? process.env.LOG_LEVEL ?? 'info',
    transport:
      process.env.NODE_ENV !== 'production'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
    timestamp: pino.stdTimeFunctions.isoTime,
    hooks: {
      logMethod(inputArgs, method, levelNum) {
        if (_logSink) {
          const levelName = LEVEL_NAMES[levelNum] ?? 'info';
          let msg = '';
          let data: string | undefined;
          if (typeof inputArgs[0] === 'string') {
            msg = inputArgs[0];
          } else if (typeof inputArgs[0] === 'object' && typeof inputArgs[1] === 'string') {
            data = JSON.stringify(inputArgs[0]);
            msg = inputArgs[1];
          }
          try {
            _logSink(levelName, name, msg, data);
          } catch {
            // never let DB write errors break logging
          }
        }
        method.apply(this, inputArgs as Parameters<typeof method>);
      },
    },
  });
}

export type Logger = pino.Logger;
