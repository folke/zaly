import type { StyleBuilder } from "./builder.ts"

import { hasAnsi } from "@zaly/shared/ansi"
import { hasColors } from "@zaly/shared/env"
import { formatWithOptions, inspect as nodeInspect } from "node:util"
import { styleBuilder } from "./builder.ts"

export interface InspectOpts {
  style?: StyleBuilder
  indent?: number
  undefined?: boolean
  null?: boolean
  /** When `true`, preserve Error stack traces. Default: `false` — Error
   *  values are reduced to their `.message` so logs stay compact. */
  stacktrace?: boolean
  colors?: boolean
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

/**
 * Inspect a list of args the way `console.log` does, returning a single
 * string. Collapses `util.format` placeholders right-to-left, unwraps
 * `Error` values to their message (unless `stacktrace: true`), and falls
 * back to `util.formatWithOptions` for mixed values.
 */
export function inspectFormat(msg: unknown[], opts: InspectOpts = {}): string {
  const data = opts.stacktrace ? msg : msg.map((v) => (v instanceof Error ? v.message : v))
  opts = { colors: hasColors, ...opts }

  let ret: unknown[] = []
  // oxlint-disable-next-line oxc/no-accumulating-spread
  for (let i = data.length - 1; i >= 0; i--) {
    const item = data[i]
    if (isFormatString(item)) ret = [formatWithOptions(opts, item, ...ret)]
    else ret.unshift(item)
  }

  if (ret.length > 1 && isFormatString(ret[0])) return formatWithOptions(opts, ...ret)
  return ret.map((v) => (typeof v === "string" ? v : inspect(v, opts))).join(" ")
}

export function inspect(value: unknown, opts: InspectOpts): string {
  opts = { colors: hasColors, null: true, undefined: true, ...opts }
  const indent = opts.indent ?? 2
  const s = opts.colors ? (opts.style ?? styleBuilder()) : styleBuilder(false)
  const sym = {
    ",": s.syntaxDelimiter(","),
    ":": s.syntaxDelimiter(":"),
    "[": s.syntaxBracket("["),
    "]": s.syntaxBracket("]"),
    "{": s.syntaxBracket("{"),
    "}": s.syntaxBracket("}"),
  }
  const seen = new Set()

  const $inspect = (v: unknown, depth: number): string => {
    if (seen.has(v)) return s.bold("[Circular]")
    if (typeof v === "object" && v !== null) seen.add(v)
    if (v === null) return s.syntaxConstant("null")
    switch (typeof v) {
      case "boolean": {
        return s.syntaxBoolean(String(v))
      }
      case "bigint": {
        return s.syntaxNumber(`${v}n`)
      }
      case "number": {
        return s.syntaxNumber(String(v))
      }
      case "string": {
        return s.syntaxString(JSON.stringify(v))
      }
      case "symbol": {
        return s.syntaxSpecial(String(v))
      }
      case "function": {
        return s.syntaxFunction(`[Function${v.name ? `: ${v.name}` : ""}]`)
      }
      case "undefined": {
        return s.syntaxConstant("undefined")
      }
      case "object": {
        if (Array.isArray(v)) {
          const items = v.map((item) => $inspect(item, depth + 1))
          return `${sym["["]} ${items.join(`${sym[","]} `)} ${sym["]"]}`
        }
        const isPlainObject = Object.getPrototypeOf(v) === Object.prototype
        if (!isPlainObject) break
        const entries = Object.entries(v)
          .filter(
            ([_, val]) => !((val === undefined && !opts.undefined) || (val === null && !opts.null))
          )
          .map(([key, val]) => `${s.syntaxField(key)}: ${$inspect(val, depth + 1)}`)
        if (indent) {
          const padding = " ".repeat(indent * depth)
          return `${sym["{"]}\n${padding}${entries.join(`${sym[","]}\n${padding}`)}\n${" ".repeat(indent * (depth - 1))}${sym["}"]}`
        }
        return `${sym["{"]} ${entries.join(`${sym[","]} `)} ${sym["}"]}`
      }
    }
    return nodeInspect(v, { colors: true, compact: true })
  }
  return $inspect(value, 1)
}
