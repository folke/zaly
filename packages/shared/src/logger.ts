export type LogLevel = (typeof LOG_LEVELS)[number]
export type LogFn = (...msg: unknown[]) => void
export type LogLevelFn = (level: LogLevel, ...msg: unknown[]) => void
export type LogApi = Record<LogLevel, LogFn> & {
  $log: LogLevelFn
}

export type LogMeta<T extends object = {}> = { name: string } & Partial<T>

export type LogEntry<T extends LogMeta = LogMeta> = {
  meta: T
  level: LogLevel
  ts: number
  msg: unknown[]
}

export type LogReporter<T extends LogMeta = LogMeta> = {
  $log(entry: LogEntry<T>): void
}

export type LogSinkFn<T extends LogMeta = LogMeta> = (data: LogEntry<T>) => void
export type LogSink<T extends LogMeta = LogMeta> = LogSinkFn<T> | LogReporter<T>

export function consoleSink<T extends LogMeta = LogMeta>(data: LogEntry<T>) {
  const { level, msg, ts: _ts, ...rest } = data
  let method = level === "cancel" ? "warn" : level
  method = method === "success" ? "info" : method
  method = method === "fatal" ? "error" : method
  console[method](...msg, rest)
}

export type LoggerOptions = {
  level?: LogLevel
}

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

// oxlint-disable-next-line sort-keys
const LOG_PRIORITY: Record<LogLevel, number> = {
  trace: 0,
  debug: 1,
  log: 2,
  info: 2,
  success: 2,
  cancel: 2,
  warn: 3,
  error: 4,
  fatal: 5,
}

export function isLogLevel(level: string): level is LogLevel {
  return (LOG_LEVELS as readonly string[]).includes(level)
}

export function shouldLog(level: string, minLevel?: LogLevel): boolean {
  if (!isLogLevel(level)) return true
  return LOG_PRIORITY[level] >= LOG_PRIORITY[minLevel ?? "log"]
}

export abstract class BaseLogger implements LogApi {
  cancel!: LogFn
  info!: LogFn
  success!: LogFn
  warn!: LogFn
  error!: LogFn
  debug!: LogFn
  fatal!: LogFn
  log!: LogFn
  trace!: LogFn

  constructor() {
    for (const level of LOG_LEVELS) this[level] = (...msg: unknown[]) => this.$log(level, ...msg)
  }

  abstract $log(level: LogLevel, ...msg: unknown[]): void
}

export class Logger<T extends LogMeta = LogMeta> extends BaseLogger {
  #sinks = new Map<string, LogSink<T>>()
  #level: LogLevel
  #meta: T
  #parent?: Logger<any>

  constructor(meta: T = { name: "logger" } as T, opts: LoggerOptions = {}) {
    super()
    this.#meta = meta
    this.#level = opts.level ?? "log"
  }

  get sinks(): ReadonlyMap<string, LogSink<T>> {
    return this.#sinks
  }

  attach(name: string, sink: LogSink<T>): this {
    this.root.#sinks.set(name, sink)
    return this
  }

  detach(name: string): this {
    this.root.#sinks.delete(name)
    return this
  }

  get level(): LogLevel {
    return this.#level
  }

  set level(level: LogLevel) {
    this.#level = level
  }

  get root(): Logger<any> {
    return this.#parent?.root ?? this
  }

  get parent(): Logger<any> | undefined {
    return this.#parent
  }

  get name() {
    return this.#meta.name
  }

  get meta(): Readonly<LogMeta<T>> {
    return { ...this.#meta }
  }

  child(name: string, opts?: LoggerOptions): Logger<T>
  child<D extends LogMeta = LogMeta>(meta: D, opts?: LoggerOptions): Logger<T & D>
  child<D extends LogMeta = LogMeta>(m: string | D, opts?: LoggerOptions): Logger<T & D> {
    const meta = (typeof m === "string" ? { name: m } : m) as D
    const child = new Logger<T & D>(
      {
        ...this.#meta,
        ...meta,
        name: `${this.#meta.name}:${meta.name}`,
      },
      { level: this.#level, ...opts }
    )
    child.#parent = this
    return child
  }

  $log = (level: LogLevel, ...msg: unknown[]) => {
    const root = this.root
    if (!shouldLog(level, this.level)) return
    const entry: LogEntry = { level, meta: { ...this.#meta }, msg, ts: Date.now() }
    for (const sink of root.#sinks.values()) {
      if (typeof sink === "function") sink(entry)
      else sink.$log(entry)
    }
  }
}

/** Installs the logger by monkey-patching the global `console` methods. Returns
 * a function to restore the original methods. */
export function installLogger(logger: LogApi) {
  const saved: Partial<Record<LogLevel, LogFn>> = {}
  const c = console as unknown as Record<string, unknown>
  for (const level of LOG_LEVELS) {
    if (typeof c[level] !== "function") continue
    saved[level] = c[level] as LogFn
    c[level] = logger[level]
  }
  return () => {
    for (const [level, fn] of Object.entries(saved))
      if (c[level] === logger[level as LogLevel]) c[level] = fn
  }
}
