import type { MountCtx } from "../core/ctx.ts"
import type { Node } from "../core/node.ts"
import type { RenderFrame } from "./frame.ts"
import type { Renderer, SurfaceType } from "./renderer.ts"

import { Emitter } from "@zaly/shared"
import { untrack } from "../core/reactive.ts"

/**
 * Base event map for renderer surfaces. Surfaces usually schedule work
 * through their owning `Renderer`; subclasses may extend this with their
 * own surface-specific events.
 *
 * @internal
 */
export type SurfaceEvents = {}

export type Point = {
  row: number
  col: number
}

/**
 * Shared base for the three renderer surfaces (`Stream`, `UI`,
 * `OverlaySurface`). Owns the common lifecycle and paint bookkeeping:
 *
 *   - `#running` flag and `#mountCtx` reference, driven by the Renderer
 *     `start` / `stop` events. Subclasses read `mountCtx` to mount nodes
 *     appended while the renderer is running.
 *   - `#dirty`, set by `invalidate()`, means this surface has content or
 *     state changes and schedules a frame.
 * Concrete surfaces override `mountAll` / `unmountAll` to walk whichever
 * node set they track, and `_render()` to compute rows and enqueue a paint
 * closure into the renderer's atomic terminal sync.
 *
 * @internal
 */
export abstract class Surface<E extends {} = never> extends Emitter<SurfaceEvents, E> {
  abstract readonly type: SurfaceType
  #running = false
  #mountCtx?: MountCtx
  #rendering?: Promise<void>
  $r: Renderer
  #dirty = false
  /** 1-based inclusive row bounds of this surface's content */
  abstract bounds: { top: number; bottom: number }

  constructor(renderer: Renderer) {
    super()
    this.$r = renderer
      .on("start", () => {
        if (this.#running) return
        this.#running = true
        this.#mountCtx = this.$r.mountCtx(this.type)
        this.mountAll(this.#mountCtx)
      })
      .on("stop", () => {
        if (!this.#running) return
        this.#running = false
        this.unmountAll()
        this.#mountCtx = undefined
      })
  }

  /** Check if this surface contains the given screen position */
  contains(point: Point): boolean {
    const { top, bottom } = this.bounds
    return point.row >= top && point.row <= bottom
  }

  get dirty(): boolean {
    return this.#dirty
  }

  track(ev: string, inc = 1): void {
    this.$r.stats.inc(ev, inc)
  }

  /** Mark this surface as changed and schedule a renderer frame. */
  invalidate = (): void => {
    this.#dirty = true
    this.track(`${this.type}.dirty`)
    untrack(() => void this.$r.emit("dirty"))
  }

  /** `true` between `onStart()` and `onStop()`. Subclasses read this
   *  to decide whether an append should mount immediately or wait. */
  protected get running(): boolean {
    return this.#running
  }

  /** The MountCtx handed in by the Renderer on `start()`. Undefined
   *  when the surface isn't running. Subclasses read this to mount
   *  nodes appended while the renderer is up. */
  protected get mountCtx(): MountCtx | undefined {
    return this.#mountCtx
  }

  /** Mount every node this surface currently tracks under `ctx`.
   *  Called by `onStart` after `#running` flips on. */
  protected abstract mountAll(ctx: MountCtx): void

  /** Unmount every node this surface currently tracks. Called by
   *  `onStop` before `#mountCtx` is cleared. */
  protected abstract unmountAll(): void

  /** Every node this surface currently tracks, for renderer traversals. */
  abstract get nodes(): readonly Node[]

  /** Paint the surface into the renderer frame. Direct callers (tests) may
   *  omit a frame; in that case a one-off frame is created and flushed. */
  abstract _render(frame: RenderFrame): Promise<void>

  async render(frame?: RenderFrame): Promise<void> {
    const ownFrame = frame ?? this.$r.frame.begin()
    return (this.#rendering ??= (async () => {
      this.#dirty = false
      await this._render(ownFrame)
      if (frame === undefined) this.$r.terminal.sync(() => ownFrame.paint())
    })().finally(() => {
      this.#rendering = undefined
    }))
  }
}
