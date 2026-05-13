import type { RenderCtx } from "./ctx.ts"
// oxlint-disable no-await-in-loop
import type { Node } from "./node.ts"
import type { SuspenseBoundary } from "./reactive.ts"

import { createCtx } from "./ctx.ts"
import { createRoot, createSuspenseBoundary, provideContext, SuspenseContext } from "./reactive.ts"

/**
 * Render a Node, draining `createAsync` work in its subtree before
 * returning final rows. Two shapes:
 *
 *   - `createRender(() => node, ctx?)` — factory form. Creates a fresh
 *     `SuspenseBoundary` inside a new `createRoot` and runs the
 *     factory in that scope so descendants find the boundary via
 *     `useContext(SuspenseContext)`. For tests, benches, REPL.
 *
 *   - `createRender(node, { ...ctx, boundary })` — pre-built Node
 *     with a caller-provided boundary. Used by `Stream.render`: the
 *     boundary was installed at `append` time, so we just render +
 *     drain without a new root scope.
 *
 * `ctx` defaults to `createCtx()` in the factory form.
 *
 * ```ts
 * const rows = await createRender(() => markdown("**hi**"))
 * ```
 */
export async function createRender(
  node: Node,
  ctx: RenderCtx & { boundary: SuspenseBoundary }
): Promise<string[]>
export async function createRender(node: () => Node, ctx?: RenderCtx): Promise<string[]>
export async function createRender(
  node: Node | (() => Node),
  ctx: RenderCtx & { boundary?: SuspenseBoundary } = createCtx()
): Promise<string[]> {
  if (ctx.boundary) return renderWithDrain(node as Node, ctx.boundary, ctx)
  const boundary = createSuspenseBoundary()
  const nodeFn = node as () => Node
  return createRoot(async () => {
    provideContext(SuspenseContext, boundary)
    return renderWithDrain(nodeFn(), boundary, ctx)
  })
}

/** Wait for any pending work first, then render. On warm caches the
 *  initial `whenIdle` resolves on the same microtask tick — no real
 *  wait — and we render exactly once with final values. On cold the
 *  wait blocks until `createAsync` settles. The follow-up `while`
 *  catches the in-render case: a `_render` that fires a fresh
 *  `createAsync` (signal write subscribes a new effect) bumps the
 *  boundary back above zero, requiring another pass. */
async function renderWithDrain(
  node: Node,
  boundary: SuspenseBoundary,
  ctx: RenderCtx
): Promise<string[]> {
  if (boundary.active()) await boundary.whenIdle()
  let rows = await node.render(ctx)
  while (boundary.active()) {
    await boundary.whenIdle()
    rows = await node.render(ctx)
  }
  return rows
}
