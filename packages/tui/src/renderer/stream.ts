import type { RenderCtx } from "../core/ctx.ts"
import type { Node } from "../core/node.ts"
import type { Terminal } from "./terminal.ts"

type RenderState = {
  node: Node
  rows: string[]
  flush?: boolean
}

const MAX_LIVE = 1

/**
 * Stream surface — an append-only list of nodes. The tail-most state is
 * re-drawn in place as its node's state changes; older states are left
 * on screen and ride natural terminal scrolling into scrollback as the
 * tail grows.
 *
 * Each `render()` pass walks `#live`, re-renders every state's node,
 * and reconciles what's on screen with the concatenated new rows in
 * three phases (inside a `?2026` synchronized-output block):
 *
 *   1. **Replace** — for the overlap `i ∈ [0, min(old, new))`, paint
 *      `newRows[i]` at the old extent's top + i whenever it differs
 *      from `oldRows[i]`. Since the kept content lives at those same
 *      row positions until the scroll phase shifts it, an index-wise
 *      compare is exactly right.
 *   2. **Shrink** — if `newRows.length < oldRows.length`, delete the
 *      trailing rows with a single `CSI N M` (DL) at the first stale
 *      row, keeping the retained rows anchored at the top of the old
 *      extent.
 *   3. **Insert** — if the tail grew, batch the new rows in chunks of
 *      `liveHeight` (so per-batch SU never over-scrolls the region,
 *      which would lose intermediate rows into scrollback as blank).
 *      For each batch: emit `CSI N S` to shift existing content up
 *      (committing the top-most rows to scrollback, as kitty /
 *      iterm / plain text all persist natively there) and free N blank
 *      rows at the bottom, then paint the batch's rows at those
 *      freed positions.
 *
 * On overflow (total rows > liveHeight), stale states at the head of
 * `#live` are marked `flush` — their rows are already committed to
 * scrollback so there's no point tracking them anymore — and removed
 * after the paint. Only the most recent state is kept live by default.
 */
export class Stream {
  #live: RenderState[] = []
  #dirty = false
  #scheduled = false
  #onInvalidate = () => this.#schedule()

  constructor(
    private readonly terminal: Terminal,
    private readonly getCtx: () => RenderCtx
  ) {}

  /**
   * Make `node` the new live tail. The previous tail's on-screen content
   * is left alone — subsequent scrolls (from this new tail growing)
   * will push it upward and, eventually, into scrollback.
   */
  append(node: Node): this {
    node.on("invalidate", this.#onInvalidate)
    this.#live.push({ node, rows: [] })
    this.#schedule()
    return this
  }

  /** How many rows the live tail may occupy before older content scrolls out. */
  get liveHeight(): number {
    return this.terminal.scrollBottom
  }

  #schedule(): void {
    this.#dirty = true
    if (this.#scheduled) return
    this.#scheduled = true
    queueMicrotask(() => {
      this.#dirty = false
      void this.render().finally(() => {
        this.#scheduled = false
        if (this.#dirty) this.#schedule()
      })
    })
  }

  async render(): Promise<void> {
    let oldRows: string[] = []
    const newRows: string[] = []
    await Promise.all(
      this.#live.map(async (state) => {
        oldRows.push(...state.rows)
        state.rows = await state.node.render(this.getCtx())
        newRows.push(...state.rows)
      })
    )
    const height = this.liveHeight
    oldRows = oldRows.slice(-height)
    const bottom = this.terminal.scrollBottom
    const top = bottom - oldRows.length + 1

    this.terminal.sync(() => {
      // replace existing lines
      for (let i = 0; i < Math.min(oldRows.length, newRows.length); i++) {
        if (oldRows[i] === newRows[i]) continue
        this.terminal.write(
          this.terminal.moveTo(top + i, 1) + this.terminal.clearLine() + newRows[i]
        )
      }
      // delete any remaining old lines (if the tail shrank)
      if (oldRows.length > newRows.length) {
        this.terminal.write(
          this.terminal.moveTo(top + newRows.length, 1) +
            this.terminal.deleteLines(oldRows.length - newRows.length)
        )
      }
      // Insert any remaining new rows (if the tail grew). Batched by
      // `height` so a single SU never exceeds `liveHeight`: scrolling
      // further would just commit blank rows to scrollback, silently
      // dropping the intermediate rows that the user would expect to
      // find in history when they scroll up.
      let i = oldRows.length
      while (i < newRows.length) {
        const batch = Math.min(newRows.length - i, height)
        this.terminal.write(this.terminal.scrollUp(batch))
        for (let j = 0; j < batch; j++) {
          this.terminal.write(
            this.terminal.moveTo(bottom - batch + 1 + j, 1) + newRows[i + j]
          )
        }
        i += batch
      }
    })

    this.flush({ keep: MAX_LIVE, render: false })

    // If the tail grew beyond the scroll region, trim older states until it fits.
    let newHeight = 0
    for (let i = this.#live.length - 1; i >= 0; i--) {
      const state = this.#live[i]
      if (newHeight > height) state.flush = true
      newHeight += state.rows.length
    }

    // remove any flushed states from the head until we hit a live one.
    while (this.#live.length > 0 && this.#live[0].flush) {
      const state = this.#live.shift()!
      state.node.off("invalidate", this.#onInvalidate)
    }
  }

  flush(opts?: { keep?: number; render?: boolean }): void {
    const keep = opts?.keep ?? 1
    const render = opts?.render ?? true
    for (let i = 0; i < this.#live.length - keep; i++) {
      const state = this.#live[i]
      state.flush = true
      // Unsubscribe synchronously: even if a render is scheduled, the
      // node shouldn't be able to re-schedule us via `invalidate` in
      // the meantime. And when `render: false`, no render will run to
      // clean up, so this is the only unsubscribe point.
      state.node.off("invalidate", this.#onInvalidate)
    }
    // Drop flushed states we aren't going to render again.
    if (!render) this.#live = this.#live.filter((s) => !s.flush)
    if (render) this.#schedule()
  }

  /** Drop the current tail without rendering anything further. */
  reset(): void {
    this.flush({ keep: 0, render: false })
  }
}
