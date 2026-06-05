import type { InspectOptions as NodeInspectOptions } from "node:util"

import { hasAnsi } from "@zaly/shared/ansi"
import { hasColors } from "@zaly/shared/env"
import { formatWithOptions, inspect as nodeInspect } from "node:util"

export interface InspectOptions {
  /** Forwarded to `util.formatWithOptions` for object inspection. */
  inspect?: NodeInspectOptions
  /** When `true`, preserve Error stack traces. Default: `false` — Error
   *  values are reduced to their `.message` so logs stay compact. */
  stacktrace?: boolean
}

// Markdown-ish characters. Matches rekal's skip regex.
const MD_RE = /[`*_#[\]\->~|]/
const JSON_RE = /^\s*[{[]/

// `util.format` placeholder tokens (`%s`, `%d`, …).
const FORMAT_RE = /%[sdifjoOc%]/

/** True when `s` looks like markdown we should render — contains MD
 *  markers and isn't already ANSI-styled. Mirrors rekal's `Formatter.markdown`
 *  skip test so we avoid double-rendering pre-styled strings. */
export function isMarkdown(s: string): boolean {
  return MD_RE.test(s) && !hasAnsi(s) && !JSON_RE.test(s)
}

const isFormatString = (v: unknown): v is string =>
  typeof v === "string" && FORMAT_RE.test(v) && !hasAnsi(v)

export function inspect(obj: unknown, opts: NodeInspectOptions = {}): string {
  opts = { colors: hasColors, ...opts }
  return nodeInspect(obj, opts)
}

/**
 * Inspect a list of args the way `console.log` does, returning a single
 * string. Collapses `util.format` placeholders right-to-left, unwraps
 * `Error` values to their message (unless `stacktrace: true`), and falls
 * back to `util.formatWithOptions` for mixed values.
 */
export function inspectFormat(msg: unknown[], opts: InspectOptions = {}): string {
  const data = opts.stacktrace ? msg : msg.map((v) => (v instanceof Error ? v.message : v))
  const inspectOpts: NodeInspectOptions = { colors: hasColors, ...opts.inspect }

  let ret: unknown[] = []
  // oxlint-disable-next-line oxc/no-accumulating-spread
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
