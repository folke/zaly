import type { Renderer, RendererOptions } from "./renderer.ts"

export type * from "./renderer.ts"
export type { OverlaySurface } from "./overlay.ts"
export type { Stream } from "./stream.ts"
export type { Terminal } from "./terminal.ts"
export type { UI } from "./ui.ts"

/** Factory shorthand for `new Renderer(opts)`. */
export async function createRenderer(opts: RendererOptions = {}): Promise<Renderer> {
  const { Renderer } = await import("./renderer.ts")
  return new Renderer(opts)
}
