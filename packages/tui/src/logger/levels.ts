export type LogLevel = (typeof LOG_LEVELS)[number]
export type LogFn<T = void> = (...msg: unknown[]) => T
/** Record mapping every `LogLevel` to a log function — the surface all
 *  loggers expose. Used by `LoggerBase` and the callable wrapper. */
export type LogApi<T = void> = Record<LogLevel, LogFn<T>>

export const LOG_LEVELS = [
  "trace",
  "debug",
  "log",
  "info",
  "success",
  "cancel",
  "warn",
  "error",
  "fatal",
] as const

const LOG_PRIORITY: Record<LogLevel, number> = {
  cancel: 2,
  debug: 1,
  error: 4,
  fatal: 5,
  info: 2,
  log: 2,
  success: 2,
  trace: 0,
  warn: 3,
}

export function isLogLevel(level: string): level is LogLevel {
  return (LOG_LEVELS as readonly string[]).includes(level)
}

export function shouldLog(level: string, minLevel?: LogLevel): boolean {
  if (!isLogLevel(level)) return true
  return LOG_PRIORITY[level] >= LOG_PRIORITY[minLevel ?? "log"]
}

export abstract class LoggerBase<T = void> implements LogApi<T> {
  cancel!: LogFn<T>
  info!: LogFn<T>
  success!: LogFn<T>
  warn!: LogFn<T>
  error!: LogFn<T>
  debug!: LogFn<T>
  fatal!: LogFn<T>
  log!: LogFn<T>
  trace!: LogFn<T>

  constructor() {
    for (const level of LOG_LEVELS) {
      this[level] = (...msg: unknown[]) => this._log(level, ...msg)
    }
  }

  protected abstract _log(level: LogLevel, ...msg: unknown[]): T
}
