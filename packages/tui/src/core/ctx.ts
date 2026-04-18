import type { Color } from "./types.ts"

/**
 * Border-character glyphs for drawing a box outline. Any single-cell string is
 * allowed (including multi-byte glyphs like rounded corners).
 */
export interface BorderChars {
  h: string
  v: string
  tl: string
  tr: string
  bl: string
  br: string
}

/**
 * A named color palette + border presets. Themes ship as data; consumers
 * pass one via `createRenderer({ theme })`.
 */
export interface Theme {
  name: string
  colors: {
    accent: Color
    bg: Color
    dim: Color
    err: Color
    fg: Color
    muted: Color
    ok: Color
    primary: Color
    warn: Color
  }
  borders?: Record<string, BorderChars>
}

/**
 * Passed to every `render(ctx)` call. Width flows in; height emerges from
 * the returned row count. Theme is ambient — children share the parent's.
 *
 * `themeKey` is an opaque content-hash of `theme` used by the per-node cache
 * to detect theme changes. It's computed lazily on the first `render()` call
 * via `ensureThemeKey()` and then propagated to child ctx objects. Callers
 * can leave it undefined; consumers should not set it manually.
 */
export interface RenderCtx {
  width: number
  theme: Theme
}
