import type { StyleBuilder } from "../style/builder.ts"
import type { Theme } from "../themes/index.ts"

import { createHash } from "node:crypto"
import { style } from "../style/builder.ts"
import { defaultTheme } from "../themes/index.ts"

export type { StyleBuilder, Theme }

/**
 * Passed to every `render(ctx)` call. Width flows in; height emerges from
 * the returned row count. Theme is ambient — children share the parent's.
 *
 * `style` is a theme-bound chainable builder made available to components so
 * they can produce inline-styled strings without re-binding the theme.
 *
 * `hash` is a memoized content-hash of the identity-relevant ctx fields
 * (`width`, `theme`). It's set by `ctxHash()` on first call at the root,
 * then propagated to children via spread so every node's cache key is stable
 * for the pass. Callers can bump any non-excluded ctx field (or add a
 * `version` field) to force a tree-wide re-render.
 */
export interface RenderCtx {
  width: number
  theme: Theme
  style: StyleBuilder
  hash?: string
}

/**
 * Build a fresh `RenderCtx` from a resolved theme + width. Binds a `style`
 * builder to the theme so components can use `ctx.style.primary(...)`
 * without constructing their own.
 *
 * Dynamic theme loading (from a string name) lives in `themes/loadTheme`
 * — resolve the name first, then pass the `Theme` object here.
 */
export function createCtx(opts?: Partial<RenderCtx>): RenderCtx {
  const theme = opts?.theme ?? defaultTheme
  return {
    style: style(theme),
    theme,
    width: opts?.width ?? 80,
  }
}

/**
 * Return the memoized cache key for `ctx`, hashing only the fields that
 * affect render output (`width`, `theme`). The `style` builder is identity-
 * tied to `theme`, and `hash` itself is the memoized result — both are
 * excluded from the hash input.
 *
 * Pass `{ force: true }` at the root of a render pass to recompute from
 * scratch (ignoring any stale cached hash on the object).
 */
export function ctxHash(ctx: RenderCtx, opts?: { force?: boolean }): string {
  const h = ctx as { hash?: string }
  if (opts?.force !== true && h.hash) return h.hash
  h.hash = createHash("sha256")
    .update(JSON.stringify({ theme: ctx.theme, width: ctx.width }))
    .digest("hex")
  return h.hash
}
