import type { MountCtx } from "../core/ctx.ts"
import type { Node } from "../core/node.ts"
import type { Renderer, SurfaceType } from "./renderer.ts"

import { Emitter } from "@zaly/shared"

/**
 * Base event map for renderer surfaces. Surfaces usually schedule work
 * through their owning `Renderer`; subclasses may extend this with their
 * own surface-specific events.
 *
 * @internal
 */
export type SurfaceEvents = {}

/**
 * Shared base for the three renderer surfaces (`Stream`, `UI`,
 * `OverlaySurface`). Owns the common lifecycle and paint bookkeeping:
 *
 *   - `#running` flag and `#mountCtx` reference, driven by the Renderer
 *     `start` / `stop` events. Subclasses read `mountCtx` to mount nodes
 *     appended while the renderer is running.
 *   - `#dirty`, set by `invalidate()`, means this surface has content or
 *     state changes and schedules a frame.
 *   - `#stale`, set by `markStale()`, means already-painted terminal rows
 *     are untrusted and should be rewritten if the surface renders in the
 *     next scheduled frame. Stale rows never schedule a frame by themselves.
 *
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
  #stale = new Set<number>()
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

  get dirty(): boolean {
    return this.#dirty || this.#stale.size > 0
  }

  track(ev: string, inc = 1): void {
    this.$r.stats.inc(ev, inc)
  }

  protected clearStale(): Set<number> {
    const ret = new Set(this.#stale)
    this.#stale.clear()
    return ret
  }

  /** Mark rows as stale so the next paint will rewrite them. If `from`
   * and `to` are omitted, marks all surface rows as stale. */
  markStale(from?: number, to?: number): void {
    const bounds = this.bounds
    from ??= bounds.top
    to ??= bounds.bottom
    for (let i = from; i <= to; i++) if (i >= bounds.top && i <= bounds.bottom) this.#stale.add(i)
  }

  /** Mark this surface as changed and schedule a renderer frame. This is
   *  for content/state invalidation; use `markStale()` for external terminal
   *  damage that should piggyback on the next scheduled render. */
  invalidate = (): void => {
    this.#dirty = true
    this.track(`${this.type}.dirty`)
    void this.$r.emit("dirty")
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

  /** Paint the surface. Renderer calls pass a capture-style `sync` that
   *  collects the paint closure for one atomic terminal frame. Direct callers
   *  (tests) omit it and each surface uses its own `terminal.sync`. */
  abstract _render(sync: (fn: () => void) => void): Promise<void>

  async render(sync?: (fn: () => void) => void): Promise<void> {
    sync ??= (fn) => this.$r.terminal.sync(fn)
    return (this.#rendering ??= (async () => {
      this.#dirty = false
      await this._render(sync)
    })().finally(() => {
      this.#rendering = undefined
    }))
  }
}
