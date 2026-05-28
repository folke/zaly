import type { LogEntry, LogLevel, LogReporter } from "@zaly/shared/logger"
import type { InspectOptions } from "../style/inspect.ts"
import type { LogState } from "../widgets/log.ts"

import { Node } from "../core/node.ts"
import { inspect, isMarkdown } from "../style/inspect.ts"
import { log } from "../widgets/log.ts"

/** Minimal stream surface the logger needs. Stream satisfies this. */
export interface LoggerStream {
  append(node: () => Node): unknown
}

export type LogEntryFactory = (level: LogLevel, msg: unknown[]) => Node

export type LogStyleOverride = Omit<LogState, "level" | "content">

export interface TuiReporterOpts extends InspectOptions {
  /** Render string messages as markdown when they look like it.
   *  Default: `true`. */
  markdown?: boolean
  /** Per-level overrides for the default `log()` widget style fields. */
  styles?: Partial<Record<LogLevel, LogStyleOverride>>
  /** Override the node produced per entry. Default uses `log()`. */
  factory?: LogEntryFactory
  wrap?: (node: Node) => Node
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

export class TuiReporter implements LogReporter {
  #stream?: LoggerStream
  #opts: TuiReporterOpts
  #factory: LogEntryFactory

  constructor(opts: TuiReporterOpts = {}) {
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

  $log({ level, msg }: LogEntry): void {
    if (this.#stream) {
      this.#stream.append(() => {
        const node = this.#factory(level, msg)
        return this.#opts.wrap?.(node) ?? node
      })
      return
    }
    this.#writeFallback(level, msg)
  }

  #defaultFactory(level: LogLevel, msg: unknown[]): Node {
    const nodes = msg.filter((m): m is Node => m instanceof Node)
    msg = msg.filter((m) => !(m instanceof Node))
    const str = inspect(msg, this.#opts)
    const markdown = (this.#opts.markdown ?? true) && isMarkdown(str)
    const overrides = this.#opts.styles?.[level] ?? {}
    return log({ content: str, level, markdown, ...overrides }, ...nodes)
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
