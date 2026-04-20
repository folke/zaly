import type { StyleBuilder } from "../style/builder.ts"
import type { Theme } from "../style/theme.ts"

import { style } from "../style/builder.ts"
import { defaultTheme } from "../style/theme.ts"

export type { StyleBuilder, Theme }

/**
 * Passed to every `render(ctx)` call. Width flows in; height emerges from
 * the returned row count. Theme is ambient — children share the parent's.
 *
 * `style` is a theme-bound chainable builder made available to components so
 * they can produce inline-styled strings without re-binding the theme.
 *
 * `version` is a monotonic cache-key bumped by the `Renderer` whenever any
 * identity-relevant ctx field changes (resize, theme swap). Node caches
 * compare this integer — no hashing, no string keys.
 */
export interface RenderCtx {
  width: number
  theme: Theme
  style: StyleBuilder
  version: number
}

/**
 * Current terminal width in cells. Returns `undefined` when stdout isn't a
 * TTY (piped output, tests, non-Node/Bun runtimes) — callers should fall
 * back to a sensible default when this is `undefined`.
 */
export function termWidth(): number | undefined {
  if (typeof process === "undefined") return undefined
  const cols = process.stdout.columns
  return typeof cols === "number" && cols > 0 ? cols : undefined
}

/**
 * Build a fresh `RenderCtx` from a resolved theme + width. Binds a `style`
 * builder to the theme so components can use `ctx.style.primary(...)`
 * without constructing their own.
 *
 * Width is clamped to the terminal's current column count (falling back to
 * 80 when stdout isn't a TTY). No width passed → terminal width is used
 * directly; an explicit `width` wider than the terminal is capped so
 * components never produce rows that wrap the display. Narrower explicit
 * widths (e.g. for fixed-layout tests) pass through unchanged.
 *
 * Dynamic theme loading (from a string name) lives in `themes/loadTheme`
 * — resolve the name first, then pass the `Theme` object here.
 */
export function createCtx(opts?: Partial<RenderCtx>): RenderCtx {
  const theme = opts?.theme ?? defaultTheme
  const tw = termWidth() ?? 80
  return {
    style: style(theme),
    theme,
    version: opts?.version ?? 0,
    width: Math.min(opts?.width ?? tw, tw),
  }
}
