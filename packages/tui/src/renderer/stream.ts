import type { Node } from "../core/node.ts"
import type { RenderCtx } from "../core/ctx.ts"
import type { Terminal } from "./terminal.ts"

/**
 * Stream surface — an append-only list of nodes where the most-recent
 * node is the *live tail*. Its rows are re-drawn in place as the node's
 * state changes; older nodes are frozen in terminal history where they
 * were originally written.
 *
 * Invariants:
 *  - The live tail always occupies the bottom `drawnHeight` rows of the
 *    scroll region, directly above the UI footer.
 *  - Growth is emitted as plain newlines at `scrollBottom`, which causes
 *    the terminal to scroll older content upward (eventually falling
 *    into scrollback). That's how "committed" rows land in history —
 *    via natural terminal scrolling, not explicit re-emits.
 *  - Each flush rewrites the visible rows from scratch; we don't diff.
 *    At tail sizes typical for chat (≤ one screen) this is pennies, and
 *    wrapping each flush in `?2026h/l` hides the re-paint atomically.
 */
export class Stream {
  #tail: Node | undefined
  #drawnHeight = 0
  #scheduled = false
  #unsubscribe: (() => void) | undefined

  constructor(
    private readonly terminal: Terminal,
    private readonly getCtx: () => RenderCtx,
  ) {}

  /**
   * Make `node` the new live tail. The previous tail's on-screen content
   * is left alone — subsequent scrolls (from this new tail growing)
   * will push it upward and, eventually, into scrollback.
   */
  append(node: Node): this {
    this.#unsubscribe?.()

    this.#tail = node
    // Reset — the new tail owns zero bottom rows until its first flush.
    // Existing content (including the previous tail) is just static
    // history from the stream's perspective.
    this.#drawnHeight = 0

    const schedule = (): void => this.#schedule()
    node.on("invalidate", schedule)
    this.#unsubscribe = () => node.off("invalidate", schedule)
    this.#schedule()
    return this
  }

  /** Currently-tracked live tail, or `undefined` before the first append. */
  get tail(): Node | undefined {
    return this.#tail
  }

  /** How many rows the live tail may occupy before older content scrolls out. */
  get liveHeight(): number {
    return this.terminal.scrollBottom
  }

  #schedule(): void {
    if (this.#scheduled) return
    this.#scheduled = true
    queueMicrotask(() => {
      this.#scheduled = false
      void this.flush()
    })
  }

  /**
   * Render the current tail and paint it bottom-anchored in the scroll
   * region. Called automatically via microtask scheduling; also
   * exposed for explicit-flush test control.
   */
  async flush(): Promise<void> {
    const tail = this.#tail
    if (tail === undefined) return

    const ctx = this.getCtx()
    const rows = await tail.render(ctx)
    const liveHeight = this.liveHeight
    const visible = Math.min(rows.length, liveHeight)
    const visibleSlice = rows.slice(rows.length - visible)
    const bottom = this.terminal.scrollBottom

    const grow = visible - this.#drawnHeight

    this.terminal.sync(() => {
      if (grow > 0) {
        // Emit `grow` newlines at `scrollBottom`. Each one scrolls the
        // region upward, freeing one more blank row at the bottom. Old
        // content (including the previous tail, and the top rows of
        // this tail's output once it overflows `liveHeight`) slides up
        // into history naturally.
        this.terminal.write(this.terminal.moveTo(bottom, 1))
        this.terminal.write("\n".repeat(grow))
      } else if (grow < 0) {
        // Tail shrank — clear the rows that are no longer part of the
        // live region.
        const oldTop = bottom - this.#drawnHeight + 1
        const newTop = bottom - visible + 1
        for (let r = oldTop; r < newTop; r++) {
          this.terminal.write(this.terminal.moveTo(r, 1) + this.terminal.clearLine())
        }
      }

      // Redraw the visible slice at absolute bottom-anchored positions.
      const top = bottom - visible + 1
      for (let i = 0; i < visible; i++) {
        this.terminal.write(
          this.terminal.moveTo(top + i, 1) + this.terminal.clearLine() + visibleSlice[i],
        )
      }

      this.#drawnHeight = visible
    })
  }

  /** Drop the current tail without rendering anything further. */
  reset(): void {
    this.#unsubscribe?.()
    this.#unsubscribe = undefined
    this.#tail = undefined
    this.#drawnHeight = 0
  }
}
