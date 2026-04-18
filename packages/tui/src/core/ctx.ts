import type { Theme } from "../style/theme.ts"

export type { Theme }

/**
 * Passed to every `render(ctx)` call. Width flows in; height emerges from
 * the returned row count. Theme is ambient — children share the parent's.
 *
 * An opaque content-hash of the ctx is memoized onto `hash` at the root
 * render via `ohash()`, then propagated to descendants via spread so every
 * node's cache key is stable across a pass. Callers may bump a `version`
 * field (or mutate any other ctx field) to force a full re-render.
 */
export interface RenderCtx {
  width: number
  theme: Theme
}
