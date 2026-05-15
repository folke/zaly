import type { Theme } from "../themes/types.ts"
import type { RenderCtx } from "./ctx.ts"
export type { RenderCtx, MountCtx } from "./ctx.ts"

export type * from "./node.ts"
export type * from "./state.ts"

export * from "./reactive.ts"
export * from "./render.ts"
export { RenderContext } from "./ctx.ts"

export async function createCtx(
  opts: Partial<RenderCtx> & { theme?: Theme } = {}
): Promise<RenderCtx> {
  const { createCtx: create } = await import("./ctx.ts")
  return create(opts)
}
