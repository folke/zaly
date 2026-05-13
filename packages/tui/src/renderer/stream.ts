import type { MountCtx, RenderCtx } from "../core/ctx.ts"
import type { Node } from "../core/node.ts"
import type { Owner, SuspenseBoundary } from "../core/reactive.ts"
import type { Terminal } from "./terminal.ts"

import {
  createNode,
  createSuspenseBoundary,
  provideContext,
  SuspenseContext,
  withOwner,
} from "../core/reactive.ts"
import { createRender } from "../core/render.ts"
import { Surface } from "./surface.ts"

type RenderState = {
  node: Node
  /** Per-state Suspense boundary. Installed at `append` time inside
   *  the appended subtree's Owner scope, so descendant `createAsync`
   *  calls find it via `useContext(SuspenseContext)`. Passed to
   *  `createRender` on each render pass — its drain loop awaits
   *  `whenIdle()` so rows promoted to scrollback reflect resolved
   *  async values. */
  boundary: SuspenseBoundary
  /** Undefined until the first render pass populates it. */
  rows?: string[]
  /** `ctx.version` captured when `rows` was produced. When the current
   *  ctx version moves past this, the cached rows are stale — we
   *  re-render even for non-live (frozen) states (e.g. on resize). */
  version?: number
  /** True while invalidate-triggered mutations should re-render this node.
   *  Flipped to false when a newer node is appended. A non-live node with
   *  `rows` set is frozen content — its bytes live on screen (and maybe
   *  in scrollback) but we won't re-render it. */
  live: boolean
}

export type StreamOptions = {
  maxLive: number
}

/**
 * Stream surface — append-only list of nodes that render into the bottom
 * of the terminal's scroll region and commit to scrollback as newer
 * content arrives.
 *
 * We keep previously-appended nodes in `#state` as long as any of their
 * rows are still on-screen, so `rows` (the getter) can report the full
 * visible slice, and so the overlay surface can reconstruct what was
 * underneath it. Only the current tail is `live` — committed nodes are
 * frozen.
 *
 * Scrollback commits happen via `\n` at `scrollBottom`: the only
 * guaranteed-portable way to move a row into scrollback (xterm.js and
 * ghostty-web's WASM parser both ignore `CSI S` for scrollback
 * promotion). So growth of the stream always flows through the bottom
 * row with a `\n`-prefix write per new row.
 */
export class Stream extends Surface {
  #state: RenderState[] = []
  #scrollbackCount = 0
  #rows: string[] = []
  /** Absolute rows outside `#rows` that need clearing on the next
   *  render — populated by `markStale` when an overlay paints at a row
   *  above the stream's tracked region. Cleared at the top of the paint
   *  closure, before Phase 1/2, so any `\n`-scroll that follows promotes
   *  blanks (not overlay bytes) into scrollback. */
  readonly #staleRows = new Set<number>()
  #opts: StreamOptions

  constructor(
    private readonly terminal: Terminal,
    private readonly getCtx: () => RenderCtx,
    private readonly rootOwner: Owner,
    opts: Partial<StreamOptions> = {}
  ) {
    super()
    this.#opts = { maxLive: 3, ...opts }
  }

  /**
   * Append `node` as the new live tail. The previous tail is frozen —
   * it stops receiving re-renders even if its state mutates.
   *
   * Function form: `append(() => node)` runs the function inside a
   * fresh Owner scope (so `signal` / `effect` / `onCleanup` /
   * `provideContext` inside `fn` attach to that scope) and appends the
   * returned Node. The Owner disposes when the Node unmounts.
   */
  append<N extends Node>(node: () => N): N {
    // Each appended subtree gets its own Suspense boundary so
    // `createRender` (called per state during render) can drain
    // pending `createAsync` work before its rows commit to scrollback.
    // The boundary is provided inside the new Owner scope so
    // descendants find it via `useContext(SuspenseContext)`.
    const boundary = createSuspenseBoundary()
    const resolved = withOwner(this.rootOwner, () =>
      createNode(() => {
        provideContext(SuspenseContext, boundary)
        return node()
      })
    )
    resolved.on("invalidate", this.onDirty)
    this.#state.push({ boundary, live: true, node: resolved })
    const ctx = this.mountCtx
    if (this.running && ctx) resolved.mount(ctx)
    this.commit({ keep: this.#opts.maxLive, render: false })
    this.emit("dirty")
    return resolved
  }

  /** How many rows the live region may occupy. */
  get liveHeight(): number {
    return this.terminal.scrollBottom
  }

  /** Tracked nodes (oldest first). Used by renderer traversals. */
  get nodes(): readonly Node[] {
    return this.#state.map((s) => s.node)
  }

  /**
   * Rows currently painted in the live region, top-to-bottom. Bottom
   * of the returned array aligns with `terminal.scrollBottom`. Exposed
   * so the overlay surface can restore what it drew over.
   */
  get rows(): readonly string[] {
    return this.#rows
  }

  async render(sync?: (fn: () => void) => void): Promise<void> {
    const run = sync ?? ((fn) => this.terminal.sync(fn))
    // Snapshot in case new appends land mid-render.
    const states = [...this.#state]
    const ctx = this.getCtx()

    // Per-state render + drain. Each state owns its boundary;
    // `createRender` blocks until that state's `createAsync` work has
    // settled, so `s.rows` is always the final resolved output. Drains
    // are independent — `Promise.all` waits for the slowest. We skip
    // states whose cached rows are still valid: only re-render when
    // live, never-rendered, or stale-cache (resize / theme swap).
    await Promise.all(
      states.map(async (s) => {
        if (s.live || s.rows === undefined || s.version !== ctx.version) {
          s.rows = await createRender(s.node, { ...ctx, boundary: s.boundary })
          s.version = ctx.version
        }
      })
    )

    const allRows: string[] = []
    for (const s of states) if (s.rows) allRows.push(...s.rows)

    const height = this.liveHeight
    const bottom = this.terminal.scrollBottom
    const oldCC = this.#scrollbackCount
    const oldVisible = this.#rows
    const oldTopRow = bottom - oldVisible.length + 1
    const oldVisibleEndIdx = oldCC + oldVisible.length

    const newCC = Math.max(oldCC, allRows.length - height)
    const newVisible = allRows.slice(newCC)
    const newTopRow = bottom - newVisible.length + 1

    // Tail shrank below the old visible extent. Treated as a separate
    // path because the bottom-anchored layout needs to move content
    // upward (or equivalently, clear stale rows above the new top and
    // rewrite in place). We never scroll into scrollback on shrink.
    const isShrink = allRows.length < oldVisibleEndIdx

    // Snapshot + clear now so the paint closure (possibly deferred via
    // the Renderer's capture) doesn't race with new `markStale` calls.
    const staleRows = [...this.#staleRows]
    this.#staleRows.clear()

    run(() => {
      // Clear any rows outside the tracked region that picked up bytes
      // from another surface (overlay). Must happen before any \n-scroll
      // so the promoted scrollback rows are blank, not ghost content.
      for (const r of staleRows) {
        this.terminal.write(this.terminal.moveTo(r, 1) + this.terminal.clearLine())
      }

      if (isShrink) {
        // Clear the rows that were above newVisible's new (higher) top.
        for (let r = oldTopRow; r < newTopRow; r++) {
          this.terminal.write(this.terminal.moveTo(r, 1) + this.terminal.clearLine())
        }
        // Rewrite the visible window — cheap enough since we only do
        // this when the tail shrinks, and we skip unchanged rows.
        for (let k = 0; k < newVisible.length; k++) {
          const oldK = k + (oldVisible.length - newVisible.length)
          if (oldVisible[oldK] === newVisible[k]) continue
          this.terminal.write(
            this.terminal.moveTo(newTopRow + k, 1) + this.terminal.clearLine() + newVisible[k]
          )
        }
      } else {
        // --- Mutations: rewrite rows whose allRows content changed ---
        // At this point the viewport still holds `oldVisible`; rewrite
        // in place at old positions. Any row we rewrite that ends up
        // scrolling into scrollback during the growth phase will carry
        // the updated content with it.
        for (let k = 0; k < oldVisible.length; k++) {
          const idx = oldCC + k
          const newContent = allRows[idx]
          if (oldVisible[k] === newContent) continue
          this.terminal.write(
            this.terminal.moveTo(oldTopRow + k, 1) + this.terminal.clearLine() + newContent
          )
        }

        // --- Growth: append new rows with \n-at-scrollBottom pattern ---
        // The `\n` promotes the region's current top row into scrollback
        // (works uniformly on xterm.js / ghostty-web / real terminals
        // as long as scrollTop is row 1). `\r` resets column so the
        // next payload starts at col 1; `clearLine` wipes any trailing
        // cells the previous write left after a shorter row.
        if (allRows.length > oldVisibleEndIdx) {
          this.terminal.write(this.terminal.moveTo(bottom, 1))
          for (let i = oldVisibleEndIdx; i < allRows.length; i++) {
            this.terminal.write(`\n\r${this.terminal.clearLine()}${allRows[i]}`)
          }
        }
      }
    })

    this.#rows = newVisible

    // Drop states whose rows have entirely entered scrollback. Any
    // dropped rows leave `allRows` too on the next tick, so decrement
    // `#scrollbackCount` accordingly — it tracks scrollback rows that
    // are still represented in our state queue.
    let dropped = 0
    while (this.#state.length > 0) {
      const first = this.#state[0]
      const len = first.rows?.length ?? 0
      if (dropped + len > newCC) break
      if (first.node.mounted) first.node.unmount()
      this.#state.shift()
      this.#commit(first)
      dropped += len
    }
    this.#scrollbackCount = newCC - dropped
  }

  /** Detach invalidate listener and mark non-live.
   * Might still render this node if it was never rendered yet */
  #commit(state: RenderState): void {
    if (!state.live) return
    state.live = false
    state.node.off("invalidate", this.onDirty)
  }

  /** Commit all but the last `keep` states. If `render` is true, also
   * schedule a render to flush the commits. */
  commit(opts?: { keep?: number; render?: boolean }): void {
    const keep = opts?.keep ?? 1
    const render = opts?.render ?? true
    let changed = false
    for (let i = 0; i < this.#state.length - keep; i++) {
      const s = this.#state[i]
      this.#commit(s)
      changed = true
    }
    if (changed && render) this.emit("dirty")
  }

  /**
   * Force a full repaint of the currently-visible stream rows on the
   * next render. Replaces each cached row with `""` so Phase 1's diff
   * sees every slot as changed and rewrites it in place — *without*
   * shrinking the array. Emptying it entirely would fool the growth
   * path into treating already-visible rows as fresh appends and
   * re-scrolling them through `\n`-at-scrollBottom, duplicating
   * on-screen content.
   */
  invalidate(): void {
    this.#rows = this.#rows.map(() => "")
    this.emit("dirty")
  }

  /**
   * Terminal was resized. The paint bookkeeping (`#rows`,
   * `#scrollbackCount`, stale-row set) was sized against the old
   * column/row geometry — after a `SIGWINCH` the real terminal has
   * re-wrapped scrollback and `scrollBottom` now points at a different
   * row. We can't reconstruct where each pre-resize row "actually"
   * landed; the pragmatic fix is to forget the visible-region bookkeeping
   * and let the next render paint from scratch against the new
   * dimensions. Node state (`#state`) is preserved so live nodes
   * re-render at the new width; their caches self-invalidate via
   * `ctx.version`.
   *
   * Paired with a screen-clear in the Renderer's resize handler — this
   * method only resets our mirror of what's on screen; the actual wipe
   * and re-establishment of DECSTBM lives in the terminal-level handler.
   */
  onResize(): void {
    this.#rows = []
    this.#scrollbackCount = 0
    this.#staleRows.clear()
    this.emit("dirty")
  }

  /**
   * Mark a range of absolute rows (inclusive) as stale — the next
   * render must clear them before any `\n`-at-scrollBottom scroll, so
   * overlay bytes never get promoted into scrollback or ghost-shifted
   * above their absolute position.
   *
   *   - Rows inside `#rows`: their cached entry becomes `""`, so the
   *     diff sees a mismatch and Phase 1 rewrites them with real
   *     stream content.
   *   - Rows outside (above) the tracked region: added to `#staleRows`
   *     and force-cleared (via `clearLine`) at the top of the next
   *     render's paint closure.
   *
   * No `"dirty"` emit — callers own their own scheduling.
   */
  markStale(fromRow: number, toRow: number): void {
    const top = this.terminal.scrollBottom - this.#rows.length + 1
    const bottom = this.terminal.scrollBottom
    const copy = [...this.#rows]
    let changed = false
    for (let r = fromRow; r <= toRow; r++) {
      const idx = r - top
      if (idx >= 0 && idx < copy.length) {
        copy[idx] = ""
        changed = true
      } else if (r >= 1 && r <= bottom) {
        // Outside the tracked region but still inside the scroll
        // region — stream doesn't "own" these rows but `\n` will
        // scroll them, so pre-clear.
        this.#staleRows.add(r)
      }
    }
    if (changed) this.#rows = copy
  }

  protected mountAll(ctx: MountCtx): void {
    for (const s of this.#state) {
      if (!s.node.mounted) s.node.mount(ctx)
    }
  }

  protected unmountAll(): void {
    // Tracked state (`#state`) is preserved so a subsequent `onStart()`
    // finds the same tree and remounts it.
    for (const s of this.#state) {
      if (s.node.mounted) s.node.unmount()
    }
  }
}
