import type { TerminalResponseEvent } from "./decoder.ts"
import type { InputRouter } from "./router.ts"

export type TerminalQuery<T = TerminalResponseEvent> = TerminalQueryOpts & {
  request: string
  match: (event: TerminalResponseEvent) => T | undefined
}

export type TerminalQueryOpts = {
  timeout?: number
  wrap?: (seq: string) => string
}

type TerminalQueryWriter = {
  write: (seq: string) => void
}

export class TerminalQueries {
  readonly #router: InputRouter
  readonly #terminal: TerminalQueryWriter

  constructor(router: InputRouter, terminal: TerminalQueryWriter) {
    this.#router = router
    this.#terminal = terminal
  }

  query<T>(query: TerminalQuery<T>): Promise<T | undefined> {
    const timeout = query.timeout ?? 200
    const ac = new AbortController()
    return new Promise((resolve) => {
      const finish = (value?: T) => {
        if (ac.signal.aborted) return
        ac.abort()
        clearTimeout(timer)
        resolve(value)
      }
      const timer = setTimeout(() => finish(), timeout)
      timer.unref()
      this.#router.on(
        "term-response",
        ({ event }) => {
          const value = query.match(event)
          if (value !== undefined) finish(value)
        },
        { signal: ac.signal }
      )
      this.#terminal.write(query.wrap?.(query.request) ?? query.request)
    })
  }

  primaryDeviceAttributes(opts: TerminalQueryOpts = {}) {
    return this.query<TerminalResponseEvent & { attrs: number[] }>({
      match: (ev) =>
        ev.kind === "csi" && ev.final === "c" && ev.params.startsWith("?")
          ? { ...ev, attrs: parseAttrs(ev.params) }
          : undefined,
      request: "\x1b[c",
      ...opts,
    })
  }

  secondaryDeviceAttributes(opts: TerminalQueryOpts = {}) {
    return this.query<TerminalResponseEvent & { attrs: number[] }>({
      match: (ev) =>
        ev.kind === "csi" && ev.final === "c" && ev.params.startsWith(">")
          ? { ...ev, attrs: parseAttrs(ev.params) }
          : undefined,
      request: "\x1b[>c",
      ...opts,
    })
  }

  xtVersion(opts: TerminalQueryOpts = {}) {
    return this.query<TerminalResponseEvent & { name: string; version?: string }>({
      match: (ev) => {
        if (ev.kind !== "dcs" || !ev.payload.startsWith(">|")) return
        const payload = ev.payload.slice(2)
        const m = payload.match(/^([^\s]+)\(([^\s]+)\)$/) ?? payload.match(/^([^\s]+)\s+([^\s]+)$/)
        return { ...ev, name: m?.[1] ?? payload, version: m?.[2] }
      },
      request: "\x1b[>q",
      ...opts,
    })
  }
}

export function parseAttrs(params: string): number[] {
  return params
    .slice(1)
    .split(";")
    .map((n) => Number.parseInt(n, 10))
    .filter(Number.isFinite)
}
