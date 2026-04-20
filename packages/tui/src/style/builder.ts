import type { Style } from "./ansi.ts"
import type { AnsiColorName, BrightAnsiColorName, Color, ColorStep } from "./color.ts"
import type { Step } from "./oklch.ts"
import type { Theme } from "./theme.ts"

import { openStyle, reapplyStyle, RESET } from "./ansi.ts"
import { resolveStyle } from "./color.ts"
import { steps as COLOR_STEPS } from "./oklch.ts"
import { defaultTheme } from "./theme.ts"

type AttrName = "bold" | "dim" | "italic" | "underline" | "inverse" | "strikethrough"

// Theme color slots that can chain as fg/bg. `fg`/`bg` become setter methods
// below, so exclude them here to avoid naming collisions. `dim` is an attr on
// the chain; users wanting theme-slot-dim for fg use `.fg("dim")`.
type ChainSlot = Exclude<keyof Theme, "fg" | "bg" | AttrName>

type FgChainKey = AnsiColorName | BrightAnsiColorName | ChainSlot
type BgChainKey = `bg${Capitalize<FgChainKey>}`
type FgExtractKey = `fg${Capitalize<FgChainKey>}`

export type StyleBuilder = {
  (text: string): string
  fg(color: Color): StyleBuilder
  bg(color: Color): StyleBuilder
  add(slot: string | Style | undefined): StyleBuilder
  /** Apply an alpha percentage (0..100) to the most recently set color
   *  channel. Appends a `/<n>` suffix so the resolver pre-composites
   *  against `theme.bg` at render time. Useful for subtle washes:
   *  `style.primary.alpha(30)`, `style.bgError.alpha(20)`. */
  alpha(n: number): StyleBuilder
  // oxlint-disable-next-line typescript/consistent-indexed-object-style -- mapped over a key union, not an open string index
} & {
  readonly [K in AttrName | FgChainKey | BgChainKey | FgExtractKey]: StyleBuilder
  // oxlint-disable-next-line typescript/consistent-indexed-object-style
} & {
  readonly [K in Step]: StyleBuilder
}

/**
 * Build styled strings via chainable property access.
 *
 * ```ts
 * style().red.bold("err")            // → "\x1b[1;31merr\x1b[0m"
 * style().primary.bgAccent("x")      // theme slots via the default theme
 * style(myTheme).primary("x")         // override the bound theme
 * style().fg("#82aaff")("x")          // hex via the escape hatch
 * style().primary[300]("x")           // tonal variant of the last color
 * style().bgDiffAdd[200].fgDiffAdd("x") // per-channel variants on a Style slot
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
  return build({}, undefined, theme)
}

const ATTRS = new Set<string>(["bold", "dim", "italic", "underline", "inverse", "strikethrough"])
const STEP_SET = new Set<number>(COLOR_STEPS)

function build(
  current: Style,
  last: "fg" | "bg" | undefined,
  theme: Theme | undefined
): StyleBuilder {
  function apply(text: string): string {
    const open = openStyle(current, theme)
    // Re-apply the outer open after any inner RESET so nested styled
    // spans inside `text` don't strip the builder's own style.
    return open === "" ? text : open + reapplyStyle(text, open) + RESET
  }

  return new Proxy(apply, {
    get(_target, key) {
      if (typeof key !== "string") return undefined

      // Numeric key → tonal variant of `last`. Works on any Color already
      // in the chain; for hex or theme slot, the downstream `colorParams`
      // splits the `-<step>` suffix and applies `variant()`. No-op when
      // no channel has been set, or when the existing value is non-hex-
      // resolvable (e.g. ANSI name or `"inherit"`).
      const asNumber = Number(key)
      if (!Number.isNaN(asNumber) && STEP_SET.has(asNumber)) {
        if (last === undefined) return build(current, last, theme)
        const existing = current[last]
        if (typeof existing !== "string" || existing === "inherit") {
          return build(current, last, theme)
        }
        // Replace (not stack) an existing suffix so `[300][500]` lands
        // on step 500, not `-300-500`.
        const base = existing.replace(/-(\d{2,3})$/, "")
        const next = `${base}-${key as ColorStep}` as Color
        return build({ ...current, [last]: next }, last, theme)
      }

      if (key === "fg") return (c: Color) => build({ ...current, fg: c }, "fg", theme)
      if (key === "bg") return (c: Color) => build({ ...current, bg: c }, "bg", theme)
      // `alpha(n)` — append a `/<n>` suffix to the last color channel.
      // Resolver pre-composites over `theme.bg` at render time. Strips
      // any existing alpha suffix so `.alpha(20).alpha(50)` lands on 50.
      if (key === "alpha") {
        return (n: number) => {
          if (last === undefined) return build(current, last, theme)
          const existing = current[last]
          if (typeof existing !== "string" || existing === "inherit") {
            return build(current, last, theme)
          }
          const stripped = existing.replace(/\/\d+$/, "")
          const next = `${stripped}/${n}` as Color
          return build({ ...current, [last]: next }, last, theme)
        }
      }
      if (ATTRS.has(key)) return build({ ...current, [key]: true }, last, theme)

      // `bgFoo` → set `bg` to the color at slot `foo`. When the slot is
      // a Style, `colorParams` extracts the Style's bg channel.
      if (key.startsWith("bg") && key.length > 2 && key[2] === key[2].toUpperCase()) {
        const color = key[2].toLowerCase() + key.slice(3)
        return build({ ...current, bg: color as Color }, "bg", theme)
      }
      // `fgFoo` → set `fg` to the color at slot `foo`. Symmetric with
      // `bgFoo`; lets callers pluck just one channel out of a Style
      // slot without adopting the whole thing.
      if (key.startsWith("fg") && key.length > 2 && key[2] === key[2].toUpperCase()) {
        const color = key[2].toLowerCase() + key.slice(3)
        return build({ ...current, fg: color as Color }, "fg", theme)
      }

      if (key === "add")
        return (ref: string | Style | undefined) =>
          build({ ...current, ...resolveStyle(ref, theme) }, last, theme)

      // Style-valued theme slot → merge its fields into the chain.
      // Anything else (ANSI color names like `"red"`, hex like `"#82aaff"`,
      // or Color-valued slot refs) is treated as a fg color and resolved
      // downstream by `colorParams`. Either way, track `fg` as the last
      // color channel so a trailing `[N]` variants the newly-set fg.
      return build({ ...current, ...resolveStyle(key, theme) }, "fg", theme)
    },
  }) as StyleBuilder
}
