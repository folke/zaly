import type { MountCtx } from "../core/ctx.ts"
import type { Node } from "../core/node.ts"
import type { Renderer } from "./renderer.ts"

import { Emitter } from "@zaly/shared"

/**
 * Events emitted by every renderer surface.
 *
 *   - `dirty` — "I need a paint." Renderer subscribes and schedules a tick.
 *   - `dirty-stream` / `dirty-ui` — cross-surface invalidation request.
 *     A surface emits these when its actions invalidate a peer (e.g. UI
 *     shrinking the footer reservation shifts on-screen stream rows; the
 *     stream's `#rows` mirror is now positionally stale and needs a
 *     repaint). The Renderer routes each event to the named surface's
 *     `invalidate()`. Keeps surfaces from holding direct refs to peers.
 *
 * Subclasses may extend with their own events via `Surface<E>`.
 *
 * @internal
 */
export type SurfaceEvents = {
  dirty: {}
  "dirty-stream": {}
  "dirty-ui": {}
}

/**
 * Shared base for the three renderer surfaces (`Stream`, `UI`,
 * `OverlaySurface`). Owns the common lifecycle + event plumbing:
 *
 *   - `#running` flag and `#mountCtx` reference, set by `onStart()`
 *     and cleared by `onStop()`. Subclasses read `mountCtx` to mount
 *     nodes appended while the renderer is running.
 *   - An `onDirty` listener reference every subclass uses to bridge
 *     tracked nodes' `invalidate` events into the surface's `dirty`
 *     event. Stable identity so `.on` / `.off` pair correctly.
 *   - Default `onStart` / `onStop` that guard against re-entry and
 *     delegate the per-surface work to `mountAll()` / `unmountAll()`.
 *
 * Concrete surfaces override `mountAll` / `unmountAll` to walk
 * whichever set of nodes they track (UI root, overlay stack, stream
 * tail, …). Everything else — `nodes` getter, `render()`, and any
 * surface-specific API — stays on the subclass.
 *
 * @internal
 */
export abstract class Surface<E extends {} = never> extends Emitter<SurfaceEvents, E> {
  #running = false
  #mountCtx?: MountCtx
  #rendering?: Promise<void>
  $r: Renderer

  constructor(renderer: Renderer) {
    super()
    this.$r = renderer
  }

  track(ev: string, inc = 1): void {
    this.$r.stats.inc(ev, inc)
  }

  /** Re-usable listener that bridges a tracked node's `invalidate`
   *  event into this surface's `dirty` event. Subclasses attach this
   *  to every node they track so any mutation anywhere in their
   *  subtree flows back to the renderer scheduler. */
  protected readonly onDirty = (): void => {
    void this.emit("dirty")
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

  /** Renderer is starting. Capture the ctx, flip running on, and let
   *  the subclass mount its tracked nodes. */
  onStart(ctx: MountCtx): void {
    if (this.#running) return
    this.#running = true
    this.#mountCtx = ctx
    this.mountAll(ctx)
  }

  /** Renderer is stopping. Flip running off and let the subclass
   *  unmount its tracked nodes. MountCtx is cleared after so
   *  subclasses can still reference it during unmount if needed. */
  onStop(): void {
    if (!this.#running) return
    this.#running = false
    this.unmountAll()
    this.#mountCtx = undefined
  }

  /** Mount every node this surface currently tracks under `ctx`.
   *  Called by `onStart` after `#running` flips on. */
  protected abstract mountAll(ctx: MountCtx): void

  /** Unmount every node this surface currently tracks. Called by
   *  `onStop` before `#mountCtx` is cleared. */
  protected abstract unmountAll(): void

  /** Every node this surface currently tracks, for renderer traversals. */
  abstract get nodes(): readonly Node[]

  /** Paint the surface. When called from `Renderer.render()` a
   *  capture-style `sync` is provided so the three surfaces paint
   *  inside one atomic sync frame. Direct callers (tests) omit it
   *  and each surface uses its own `terminal.sync`. */
  abstract _render(sync?: (fn: () => void) => void): Promise<void>

  async render(sync?: (fn: () => void) => void): Promise<void> {
    return (this.#rendering ??= this._render(sync).finally(() => {
      this.#rendering = undefined
    }))
  }
}
