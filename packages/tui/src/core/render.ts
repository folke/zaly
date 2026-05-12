import type { Node } from "./node.ts"
import type { RenderCtx } from "./ctx.ts"

import { createCtx } from "./ctx.ts"
import {
  createRoot,
  createSuspenseBoundary,
  provideContext,
  SuspenseContext,
} from "./reactive.ts"

/**
 * Construct + render a Node, draining any `createAsync` calls inside it
 * before returning. Useful in tests, benches, headless scripts — any
 * caller that doesn't have a `Stream` surface to install a Suspense
 * boundary on their behalf.
 *
 * The factory shape is required (not a pre-built Node): `createAsync`
 * captures `useContext(SuspenseContext)` at construction time, so a
 * boundary installed *after* the Node was built wouldn't reach it. We
 * provide the boundary inside a fresh `createRoot`, then run the
 * factory in that scope — every descendant `createAsync` sees the
 * boundary and increments/decrements through it.
 *
 * `ctx` defaults to `createCtx()` so trivial callers (smoke tests,
 * REPL one-liners) don't have to construct one. Pass an explicit ctx
 * when you need a specific width or theme.
 *
 * ```ts
 * const rows = await createRender(() => markdown("**hi**"))
 * const rows = await createRender(() => code({ code, lang }), createCtx({ width: 80 }))
 * ```
 */
export async function createRender(
  factory: () => Node,
  ctx: RenderCtx = createCtx()
): Promise<string[]> {
  const boundary = createSuspenseBoundary()
  return createRoot(async () => {
    provideContext(SuspenseContext, boundary)
    const node = factory()
    // Same drain pattern as `Stream.render`: drain at least once if
    // anything was pending at construction, then loop while any
    // further async fires during re-render. Re-rendering is cheap on
    // unchanged subtrees thanks to the per-Node cache.
    let rows = await node.render(ctx)
    let wasActive = boundary.active()
    while (wasActive || boundary.active()) {
      // oxlint-disable-next-line no-await-in-loop
      await boundary.whenIdle()
      // oxlint-disable-next-line no-await-in-loop
      rows = await node.render(ctx)
      wasActive = false
    }
    return rows
  })
}
