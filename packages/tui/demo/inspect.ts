import { inspect } from "node:util"
import { styleBuilder, type StyleBuilder } from "../src/style/builder.ts"
import { loadTheme } from "../src/themes/registry.ts"

// oxlint-disable-next-line sort-keys
const obj = {
  array: [1, "two", { three: 3 }],
  bigint: 123n,
  bool: true,
  date: new Date("2024-01-01T00:00:00Z"),
  nested: { a: 1, b: [1, 2, 3] },
  // oxlint-disable-next-line unicorn/no-null
  null: null,
  number: 123,
  proxy: new Proxy({ a: 1 }, {}),
  regexAdvanced: /foo(?<bar>baz)/g,
  regexp: /abc/i,
  string: "hello",
  stringWithNewline: "line1\nline2",
  symbol: Symbol("sym"),
  undefined,
  // oxlint-disable-next-line func-name-matching
  func: function test() {},
}

console.log("inspect", obj)

console.log("inspect", obj)

export type InspectOpts = {
  style: StyleBuilder
  indent?: number
  undefined?: boolean
  null?: boolean
}

function inspect2(value: unknown, opts: InspectOpts): string {
  opts = { null: true, undefined: true, ...opts }
  const indent = opts.indent ?? 2
  const s = opts.style
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
    return inspect(v, { colors: true, compact: true })
  }
  return $inspect(value, 1)
}

console.log(
  inspect2(obj, {
    indent: 2,
    style: styleBuilder(await loadTheme("catppuccin-mocha")),
  })
)
