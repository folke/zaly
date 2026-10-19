import type { HexColor } from "../style/types.ts"
import type { TerminalResponseEvent } from "./decoder.ts"
import type { InputRouter } from "./router.ts"

export type TerminalQuery<T = TerminalResponseEvent> = TerminalQueryOpts & {
  request: string
  match: (event: TerminalResponseEvent) => T | undefined
}

export type TerminalQueryOpts = {
  signal?: AbortSignal
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
    if (query.signal?.aborted) return Promise.resolve(undefined)
    const timeout = query.timeout ?? 200
    const ac = new AbortController()
    return new Promise((resolve) => {
      const finish = (value?: T) => {
        if (ac.signal.aborted) return
        ac.abort()
        clearTimeout(timer)
        query.signal?.removeEventListener("abort", cancel)
        resolve(value)
      }
      const cancel = () => finish()
      const timer = setTimeout(cancel, timeout)
      timer.unref()
      this.#router.on(
        "term-response",
        ({ event }) => {
          const value = query.match(event)
          if (value !== undefined) finish(value)
        },
        { signal: ac.signal }
      )
      query.signal?.addEventListener("abort", cancel, { once: true })
      this.#terminal.write(query.wrap?.(query.request) ?? query.request)
    })
  }

  color(index: number | "fg" | "bg" | "selectionBg" | "selectionFg", opts: TerminalQueryOpts = {}) {
    if (typeof index === "number" && (!Number.isInteger(index) || index < 0 || index > 255)) {
      throw new RangeError("Palette index must be an integer between 0 and 255")
    }
    const dynamic = { bg: 11, fg: 10, selectionBg: 17, selectionFg: 19 }
    const prefix = typeof index === "number" ? `4;${index};` : `${dynamic[index]};`
    return this.query<HexColor>({
      ...opts,
      match: (event) => {
        if (event.kind !== "osc") return
        if (typeof index === "number" && event.payload.startsWith("4;")) {
          const parts = event.payload.slice(2).split(";")
          for (let i = 0; i + 1 < parts.length; i += 2) {
            if (parts[i] === String(index)) return parseTerminalColor(parts[i + 1])
          }
          return
        }
        if (event.payload.startsWith(prefix))
          return parseTerminalColor(event.payload.slice(prefix.length))
      },
      request: `\x1b]${prefix}?\x1b\\`,
    })
  }

  colorScheme(opts: TerminalQueryOpts = {}) {
    return this.query<"dark" | "light">({
      ...opts,
      match: (event) => {
        if (event.kind !== "csi" || event.final !== "n") return
        if (event.params === "?997;1") return "dark"
        if (event.params === "?997;2") return "light"
      },
      request: "\x1b[?996n",
    })
  }

  async palette(opts: TerminalQueryOpts = {}): Promise<TerminalPaletteSnapshot> {
    const colorOpts = { ...opts, timeout: opts.timeout ?? 100 }
    const [ansi, fg, bg] = await Promise.all([
      Promise.all(Array.from({ length: 16 }, (_, i) => this.color(i, colorOpts))),
      this.color("fg", colorOpts),
      this.color("bg", colorOpts),
    ])
    return { ansi, bg, fg }
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

export interface TerminalPaletteSnapshot {
  ansi: (HexColor | undefined)[]
  bg?: HexColor
  fg?: HexColor
  selectionBg?: HexColor
  selectionFg?: HexColor
}

/** OSC replies use X11 rgb components, with one to four hex digits per channel. */
export function parseTerminalColor(value: string): HexColor | undefined {
  let parts = /^rgb:([\da-f]{1,4})\/([\da-f]{1,4})\/([\da-f]{1,4})$/i.exec(value)?.slice(1)
  if (!parts && /^#(?:[\da-f]{3}|[\da-f]{6}|[\da-f]{9}|[\da-f]{12})$/i.test(value)) {
    const size = (value.length - 1) / 3
    parts = Array.from({ length: 3 }, (_, i) => value.slice(1 + i * size, 1 + (i + 1) * size))
  }
  if (!parts) return
  return `#${parts
    .map((part) =>
      Math.round((Number.parseInt(part, 16) / (16 ** part.length - 1)) * 255)
        .toString(16)
        .padStart(2, "0")
    )
    .join("")}`
}

export function parseAttrs(params: string): number[] {
  return params
    .slice(1)
    .split(";")
    .map((n) => Number.parseInt(n, 10))
    .filter(Number.isFinite)
}
