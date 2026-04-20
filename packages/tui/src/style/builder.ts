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
  return build({ current: {}, last: undefined, theme })
}

const ATTRS = new Set<string>(["bold", "dim", "italic", "underline", "inverse", "strikethrough"])
const STEP_SET = new Set<number>(COLOR_STEPS)

/** Pending "arg-taking" op on a chain. Set when the caller accesses
 *  `.fg` / `.bg` / `.alpha` / `.add` — the chain is "parked" waiting
 *  for its argument. Calling the parked chain consumes the arg and
 *  produces the real child chain. */
type PendingOp = "fg" | "bg" | "alpha" | "add"

/** All the inputs a chain needs to behave correctly, gathered in one
 *  object so we can pass it around cheaply instead of closing over
 *  four separate vars. `current` is the accumulated Style, `last`
 *  tracks which of `fg`/`bg` was most recently touched (for `[step]`
 *  and `.alpha()`), `theme` is the resolved theme, `pending` is set
 *  on parked arg-taking chains. */
interface BuilderState {
  current: Style
  last: "fg" | "bg" | undefined
  theme: Theme | undefined
  pending?: PendingOp
}

/** The function wrapped by every chain's Proxy. Carries its own state
 *  so module-level handlers can read it without closure gymnastics. */
type BuilderFn = {
  state: BuilderState
} & (((text: string) => string) | ((arg: Color | number | Style | undefined) => StyleBuilder))

// --- module-level handlers (shared across every chain) -----------------

function applyStyle(state: BuilderState, text: string): string {
  if (!text) return text
  const open = openStyle(state.current, state.theme)
  return open === "" ? text : open + reapplyStyle(text, open) + RESET
}

function applyOp(fn: BuilderFn, arg: Color | number | Style | undefined): StyleBuilder {
  // Cache primitive args on the call target itself via `defineProperty`
  // — repeated `.fg("#82aaff")` hits the same child chain after the
  // first call, no rebuild. Object args (e.g. raw Style for `add`)
  // can't be property keys (`"[object Object]"` collision), so those
  // always rebuild.
  if (typeof arg === "string" || typeof arg === "number") {
    const key = String(arg)
    const hit = (fn as unknown as Record<string, unknown>)[key]
    if (hit !== undefined) return hit as StyleBuilder
    const child = fulfill(fn.state, arg)
    Reflect.defineProperty(fn, key, { configurable: false, value: child, writable: false })
    return child
  }
  return fulfill(fn.state, arg)
}

/** Turn a parked chain + its arg into the real child chain. */
function fulfill(state: BuilderState, arg: unknown): StyleBuilder {
  const { current, last, theme, pending } = state
  switch (pending) {
    case "fg": {
      return build({ current: { ...current, fg: arg as Color }, last: "fg", theme })
    }
    case "bg": {
      return build({ current: { ...current, bg: arg as Color }, last: "bg", theme })
    }
    case "alpha": {
      if (last === undefined) return build({ current, last, theme })
      const existing = current[last]
      if (typeof existing !== "string" || existing === "inherit") {
        return build({ current, last, theme })
      }
      const stripped = existing.includes("/") ? existing.replace(/\/\d+$/, "") : existing
      const next = `${stripped}/${arg as number}` as Color
      return build({ current: { ...current, [last]: next }, last, theme })
    }
    default: {
      // "add" — no pending pending? defaults to rebuild with undef arg.
      return build({
        current: { ...current, ...resolveStyle(arg as string | Style | undefined, theme) },
        last,
        theme,
      })
    }
  }
}

/** Resolve a single property access on a chain to its child chain. */
function compileKey(state: BuilderState, key: string): StyleBuilder | undefined {
  const { current, last, theme } = state

  // Numeric key → tonal variant of `last`. No-op when no channel has
  // been set, or when the existing value is non-hex-resolvable.
  const asNumber = Number(key)
  if (!Number.isNaN(asNumber) && STEP_SET.has(asNumber)) {
    if (last === undefined) return build({ current, last, theme })
    const existing = current[last]
    if (typeof existing !== "string" || existing === "inherit") {
      return build({ current, last, theme })
    }
    // Replace (not stack) an existing suffix so `[300][500]` lands
    // on step 500, not `-300-500`.
    const base = existing.includes("-") ? existing.replace(/-(\d{2,3})$/, "") : existing
    const next = `${base}-${key as ColorStep}` as Color
    return build({ current: { ...current, [last]: next }, last, theme })
  }

  // Arg-taking ops come back as chains parked in the `pending` state.
  if (key === "fg" || key === "bg" || key === "alpha" || key === "add") {
    return build({ current, last, pending: key, theme })
  }

  if (ATTRS.has(key)) return build({ current: { ...current, [key]: true }, last, theme })

  // `bgFoo` / `fgFoo` → set the channel to the color at slot `foo`.
  // When the slot is a Style, `colorParams` extracts that channel.
  if (key.startsWith("bg") && key.length > 2 && key[2] === key[2].toUpperCase()) {
    const color = (key[2].toLowerCase() + key.slice(3)) as Color
    return build({ current: { ...current, bg: color }, last: "bg", theme })
  }
  if (key.startsWith("fg") && key.length > 2 && key[2] === key[2].toUpperCase()) {
    const color = (key[2].toLowerCase() + key.slice(3)) as Color
    return build({ current: { ...current, fg: color }, last: "fg", theme })
  }

  // Style-valued theme slot → merge its fields into the chain.
  // Anything else (ANSI color names, hex, unresolved slot refs) is
  // treated as a fg color by `colorParams` downstream.
  return build({ current: { ...current, ...resolveStyle(key, theme) }, last: "fg", theme })
}

/** Shared Proxy handler — one instance, used by every chain. Reads
 *  state off the target (the `BuilderFn`), so chain construction
 *  doesn't allocate a fresh handler object per `build()` call. */
const proxyHandler: ProxyHandler<BuilderFn> = {
  get(target, key) {
    if (typeof key !== "string") return undefined
    const cached = (target as unknown as Record<string, unknown>)[key]
    if (cached !== undefined) return cached
    // Parked chains can't be chained further — they're waiting for a call.
    if (target.state.pending !== undefined) return undefined
    const child = compileKey(target.state, key)
    if (child === undefined) return undefined
    Reflect.defineProperty(target, key, { configurable: false, value: child, writable: false })
    return child
  },
}

function build(state: BuilderState): StyleBuilder {
  // Two dedicated function shapes so V8 sees a stable signature on
  // each hot path — styling text vs. consuming an op arg are both
  // monomorphic after the build-time ternary.
  const fn = (
    state.pending === undefined
      ? function apply(text: string): string {
          return applyStyle(state, text)
        }
      : function applyOpCall(arg: Color | number | Style | undefined): StyleBuilder {
          return applyOp(fn, arg)
        }
  ) as BuilderFn
  fn.state = state
  return new Proxy(fn, proxyHandler) as unknown as StyleBuilder
}
