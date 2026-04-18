import type { Style } from "./ansi.ts"
import type { AnsiColorName, BrightAnsiColorName, Color } from "./color.ts"
import type { Theme } from "./theme.ts"

import { openStyle, RESET } from "./ansi.ts"
import { reapplyBg, resolveStyle } from "./compose.ts"
import { defaultTheme } from "./theme.ts"

type AttrName = "bold" | "dim" | "italic" | "underline" | "inverse" | "strikethrough"

// Theme color slots that can chain as fg/bg. `fg`/`bg` become setter methods
// below, so exclude them here to avoid naming collisions. `dim` is an attr on
// the chain; users wanting theme-slot-dim for fg use `.fg("dim")`.
type ChainSlot = Exclude<keyof Theme, "fg" | "bg" | AttrName>

type FgChainKey = AnsiColorName | BrightAnsiColorName | ChainSlot
type BgChainKey = `bg${Capitalize<FgChainKey>}`

export type StyleBuilder = {
  (text: string): string
  fg(color: Color): StyleBuilder
  bg(color: Color): StyleBuilder
  add(slot: string | Style | undefined): StyleBuilder
  // oxlint-disable-next-line typescript/consistent-indexed-object-style -- mapped over a key union, not an open string index
} & {
  readonly [K in AttrName | FgChainKey | BgChainKey]: StyleBuilder
}

/**
 * Build styled strings via chainable property access.
 *
 * ```ts
 * style().red.bold("err")           // → "\x1b[1;31merr\x1b[0m"
 * style().primary.bgAccent("x")     // theme slots via the default theme
 * style(myTheme).primary("x")        // override the bound theme
 * style().fg("#82aaff")("x")         // hex via the escape hatch
 * ```
 *
 * Each property access returns a fresh builder, so intermediates can be
 * reused and extended without mutation:
 *
 * ```ts
 * const err = style().red.bold
 * err("oops"); err.underline("fatal")
 * ```
 *
 * Calling an empty builder is a no-op: `style()("x")` returns `"x"` unchanged.
 */
export function style(theme: Theme = defaultTheme): StyleBuilder {
  return build({}, theme)
}

const ATTRS = new Set<string>(["bold", "dim", "italic", "underline", "inverse", "strikethrough"])

function build(current: Style, theme: Theme | undefined): StyleBuilder {
  function apply(text: string): string {
    const open = openStyle(current, theme)
    // Re-apply the outer open after any inner RESET so nested styled
    // spans inside `text` don't strip the builder's own style.
    return open === "" ? text : open + reapplyBg(text, open) + RESET
  }

  return new Proxy(apply, {
    get(_target, key) {
      if (typeof key !== "string") return undefined
      if (key === "fg") return (c: Color) => build({ ...current, fg: c }, theme)
      if (key === "bg") return (c: Color) => build({ ...current, bg: c }, theme)
      if (ATTRS.has(key)) return build({ ...current, [key]: true }, theme)
      if (key.startsWith("bg") && key.length > 2) {
        const color = key[2].toLowerCase() + key.slice(3)
        return build({ ...current, bg: color as Color }, theme)
      }
      if (key === "add")
        return (ref: string | Style | undefined) =>
          build({ ...current, ...resolveStyle(ref, theme) }, theme)
      // Style-valued theme slot → merge its fields into the chain.
      // Anything else (ANSI color names like `"red"`, hex like `"#82aaff"`,
      // or Color-valued slot refs) is treated as a fg color and resolved
      // downstream by `colorParams`.
      return build({ ...current, ...resolveStyle(key, theme) }, theme)
    },
  }) as StyleBuilder
}
