import type { InspectOptions as NodeInspectOptions } from "node:util"

import { hasColors } from "@zaly/shared/env"
import { formatWithOptions } from "node:util"
import { hasAnsi } from "../style/ansi.ts"

export interface InspectOptions {
  /** Forwarded to `util.formatWithOptions` for object inspection. */
  inspect?: NodeInspectOptions
  /** When `true`, preserve Error stack traces. Default: `false` — Error
   *  values are reduced to their `.message` so logs stay compact. */
  stacktrace?: boolean
}

// Markdown-ish characters. Matches rekal's skip regex.
const MD_RE = /[`*_#[\]\->~|]/

// `util.format` placeholder tokens (`%s`, `%d`, …).
const FORMAT_RE = /%[sdifjoOc%]/

/** True when `s` looks like markdown we should render — contains MD
 *  markers and isn't already ANSI-styled. Mirrors rekal's `Formatter.markdown`
 *  skip test so we avoid double-rendering pre-styled strings. */
export function isMarkdown(s: string): boolean {
  return MD_RE.test(s) && !hasAnsi(s)
}

const isFormatString = (v: unknown): v is string => typeof v === "string" && FORMAT_RE.test(v)

/**
 * Inspect a list of args the way `console.log` does, returning a single
 * string. Collapses `util.format` placeholders right-to-left, unwraps
 * `Error` values to their message (unless `stacktrace: true`), and falls
 * back to `util.formatWithOptions` for mixed values.
 */
export function inspect(msg: unknown[], opts: InspectOptions = {}): string {
  const data = opts.stacktrace ? msg : msg.map((v) => (v instanceof Error ? v.message : v))
  // Colors on by default — logger output is always rendered through the
  // stream surface (which emits ANSI anyway), so `util.inspect`'s per-
  // token colors should pass through. Callers can still opt out via
  // `opts.inspect.colors = false`.
  const inspectOpts: NodeInspectOptions = { colors: hasColors, ...opts.inspect }

  // oxlint-disable-next-line oxc/no-accumulating-spread
  let ret: unknown[] = []
  for (let i = data.length - 1; i >= 0; i--) {
    const item = data[i]
    if (isFormatString(item)) {
      ret = [formatWithOptions(inspectOpts, item, ...ret)]
    } else {
      ret.unshift(item)
    }
  }

  if (ret.length === 1 && typeof ret[0] === "string") return ret[0]
  return formatWithOptions(inspectOpts, ...ret)
}
