import type { RenderCtx } from "../core/ctx.ts"
import type { Node } from "../core/node.ts"
import type { Terminal } from "./terminal.ts"

import { Emitter } from "../core/emitter.ts"

type RenderState = {
  node: Node
  /** Undefined until the first render pass populates it. */
  rows?: string[]
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
/** Events emitted by the Stream surface. `dirty` signals that a new
 *  render is needed; the Renderer subscribes and schedules a tick. */
export interface StreamEvents extends Record<string, unknown[]> {
  dirty: []
}

export class Stream extends Emitter<StreamEvents> {
  #state: RenderState[] = []
  #scrollbackCount = 0
  #rows: string[] = []
  #opts: StreamOptions
  readonly #onInvalidate = (): void => {
    this.emit("dirty")
  }

  constructor(
    private readonly terminal: Terminal,
    private readonly getCtx: () => RenderCtx,
    opts: Partial<StreamOptions> = {}
  ) {
    super()
    this.#opts = { maxLive: 3, ...opts }
  }

  /**
   * Append `node` as the new live tail. The previous tail is frozen —
   * it stops receiving re-renders even if its state mutates.
   */
  add(node: Node): this {
    node.on("invalidate", this.#onInvalidate)
    this.#state.push({ live: true, node })
    this.commit({ keep: this.#opts.maxLive, render: false })
    this.emit("dirty")
    return this
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

    // Re-render only live states and any state we haven't rendered yet
    // (e.g. two appends in the same tick — the first became non-live
    // when the second arrived, but it still needs an initial render).
    await Promise.all(
      states.map(async (s) => {
        if (s.live || s.rows === undefined) {
          s.rows = await s.node.render(this.getCtx())
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

    run(() => {
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
    state.node.off("invalidate", this.#onInvalidate)
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

  /** Drop the current tail without rendering anything further. */
  reset(): void {
    for (const s of this.#state) this.#commit(s)
    this.#state.length = 0
    this.#scrollbackCount = 0
    this.#rows = []
  }
}
