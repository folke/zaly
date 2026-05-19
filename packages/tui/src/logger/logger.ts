import type { Node } from "../core/node.ts"
import type { LogState } from "../widgets/log.ts"
import type { InspectOptions } from "./inspect.ts"
import type { LogApi, LogFn, LogLevel } from "./levels.ts"

import { log } from "../widgets/log.ts"
import { inspect } from "./inspect.ts"
import { LoggerBase, shouldLog } from "./levels.ts"

/** Minimal stream surface the logger needs. Stream satisfies this. */
export interface LoggerStream {
  append(node: () => Node): unknown
}

export type LogEntryFactory = (level: LogLevel, msg: unknown[]) => Node

export type LogStyleOverride = Omit<LogState, "level" | "content">

export interface LoggerOptions extends InspectOptions {
  /** Minimum level to emit. Defaults to `"log"`. */
  minLevel?: LogLevel
  /** Render string messages as markdown when they look like it.
   *  Default: `true`. */
  markdown?: boolean
  /** Per-level overrides for the default `log()` widget style fields. */
  styles?: Partial<Record<LogLevel, LogStyleOverride>>
  /** Override the node produced per entry. Default uses `log()`. */
  factory?: LogEntryFactory
  /** Fallback writer for when no stream is attached. Defaults to
   *  `process.stdout/stderr`. Injectable for tests. */
  write?: (text: string, kind: "stdout" | "stderr") => void
}

const ERR_LEVELS = new Set<LogLevel>(["error", "fatal", "warn"])

function defaultWrite(text: string, kind: "stdout" | "stderr"): void {
  if (typeof process === "undefined") return
  const stream = kind === "stderr" ? process.stderr : process.stdout
  stream.write(text)
}

export class Logger extends LoggerBase {
  #stream?: LoggerStream
  #opts: LoggerOptions
  #factory: LogEntryFactory

  constructor(opts: LoggerOptions = {}) {
    super()
    this.#opts = opts
    this.#factory = opts.factory ?? ((level, msg) => this.#defaultFactory(level, msg))
  }

  attach(stream: LoggerStream): this {
    this.#stream = stream
    return this
  }

  detach(): this {
    this.#stream = undefined
    return this
  }

  protected _log(level: LogLevel, ...msg: unknown[]): void {
    if (!shouldLog(level, this.#opts.minLevel)) return
    if (this.#stream) {
      this.#stream.append(() => this.#factory(level, msg))
      return
    }
    this.#writeFallback(level, msg)
  }

  #defaultFactory(level: LogLevel, msg: unknown[]): Node {
    const str = inspect(msg, this.#opts)
    const overrides = this.#opts.styles?.[level] ?? {}
    return log({ content: str, level, markdown: this.#opts.markdown, ...overrides })
  }

  /** String path for the no-stream fallback — builds a plain inspected
   *  line (no prefix chrome) and writes it to stdout/stderr. Keeps the
   *  fallback synchronous and ordered. */
  #writeFallback(level: LogLevel, msg: unknown[]): void {
    const str = inspect(msg, this.#opts)
    const kind: "stdout" | "stderr" = ERR_LEVELS.has(level) ? "stderr" : "stdout"
    const write = this.#opts.write ?? defaultWrite
    write(`${str}\n`, kind)
  }
}

/**
 * A `Logger` exposed as a callable. Call directly to log at `"log"`
 * level; access level methods as properties (`log.error("boom")`). All
 * `Logger` methods (`install`, `attach`, …) are reachable as properties.
 */
export type LogCallable = LogFn &
  LogApi &
  Pick<Logger, "attach" | "detach" | "install" | "uninstall">

/**
 * Wrap a `Logger` in a callable Proxy so `log("x")` works in addition
 * to `log.error("x")`. Mainly used by `Renderer.log` but also handy
 * when exposing a logger from app code.
 */
export function makeLog(logger: Logger): LogCallable {
  const fn = ((...msg: unknown[]) => logger.log(...msg)) as LogCallable
  return new Proxy(fn, {
    get(target, key) {
      if (key in target) return Reflect.get(target, key)
      const v = (logger as unknown as Record<PropertyKey, unknown>)[key]
      return typeof v === "function" ? v.bind(logger) : v
    },
  })
}
