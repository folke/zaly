import type { RenderCtx } from "../core/ctx.ts"
import type { Box } from "../nodes/box.ts"
import type { Terminal } from "./terminal.ts"

import { box } from "../nodes/box.ts"

/**
 * UI surface — the sticky footer. Renders a single Box tree at the
 * bottom of the terminal, inside the rows reserved by `Terminal`'s
 * scroll region. Row-diff redraws: only changed rows are rewritten on
 * each flush, so an input widget re-rendering every keystroke doesn't
 * repaint the entire footer.
 *
 * Height is determined by the root's rendered row count, capped to a
 * sensible upper bound so a runaway render can't take over the screen.
 * When the height changes the terminal's reserved bottom gets updated,
 * which rewrites `DECSTBM`; the stream surface then has less/more room
 * and its next flush naturally fills the new geometry.
 */
export interface UIOptions {
  /**
   * Upper bound on footer height. Renders taller than this are clipped
   * to the top `maxHeight` rows. Default: one third of viewport.
   */
  maxHeight?: number
}

export class UI {
  readonly #root: Box = box({ flexDirection: "column" })
  #lastRows: string[] = []
  #scheduled = false
  readonly #maxHeight: number | undefined

  constructor(
    private readonly terminal: Terminal,
    private readonly getCtx: () => RenderCtx,
    opts: UIOptions = {},
  ) {
    this.#maxHeight = opts.maxHeight
    // Tag the root as scope `"global"` — the input router resolves
    // `"global.*"` keymap bindings by walking the focused node's parent
    // chain, and any focusable widget ultimately parents to this root.
    // So this tagging is what makes globals fire on every keystroke
    // without a dedicated always-matching path in the router.
    this.#root.id = "global"
    // Root invalidates propagate to us via the parent chain (no parent
    // set above — the UI owns the root). Subscribe directly.
    this.#root.on("invalidate", () => this.#schedule())
  }

  /** The footer's root Box. Add children via `ui.root.add(child)`. */
  get root(): Box {
    return this.#root
  }

  /** Current rendered height (rows). */
  get height(): number {
    return this.#lastRows.length
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
   * Render the footer tree and paint the diff against the last paint.
   * Updates the terminal's reservation whenever the height changes so
   * the scroll region stays correctly sized.
   */
  async flush(): Promise<void> {
    const ctx = this.getCtx()
    const rendered = await this.#root.render({ ...ctx, width: this.terminal.cols })
    const cap = this.#maxHeight ?? Math.max(1, Math.floor(this.terminal.rows / 3))
    const rows = rendered.slice(0, cap)

    const prevHeight = this.#lastRows.length
    const nextHeight = rows.length

    this.terminal.sync(() => {
      // Grow: before shrinking the scroll region, scroll its existing
      // contents up by the growth amount. That way any rows the stream
      // had painted at the bottom of the scroll region ride upward
      // (their topmost rows sliding into scrollback) rather than being
      // overwritten when the footer paints onto the rows that used to
      // be scroll region. SU runs first so it operates on the OLD,
      // still-larger region.
      if (nextHeight > prevHeight) {
        const growth = nextHeight - prevHeight
        this.terminal.write(this.terminal.scrollUp(growth))
      }

      // Resize the reserved bottom to match the new footer height.
      // Reissues DECSTBM — the stream surface sees a different
      // `scrollBottom` on its next flush.
      if (nextHeight !== this.terminal.reserveBottom) {
        this.terminal.setReserveBottom(nextHeight)
      }

      // Shrink: after enlarging the scroll region, scroll its contents
      // down by the shrink amount. Stream content that was bottom-
      // anchored to the old (smaller) region shifts down so it stays
      // anchored to the new one. The previously-footer rows sitting at
      // the top of the newly-enlarged region fall off the bottom as
      // part of that scroll — which is exactly what we want, since
      // they held stale footer text. Top `shrink` rows become blank.
      if (prevHeight > nextHeight) {
        const shrink = prevHeight - nextHeight
        this.terminal.write(this.terminal.scrollDown(shrink))
      }

      // Paint (or re-paint) each footer row. The footer starts at
      // `footerTop` (1-based). Only rewrite rows whose content changed.
      const top = this.terminal.footerTop
      for (let i = 0; i < nextHeight; i++) {
        if (this.#lastRows[i] === rows[i] && prevHeight === nextHeight) continue
        this.terminal.write(
          this.terminal.moveTo(top + i, 1) + this.terminal.clearLine() + rows[i],
        )
      }
    })

    this.#lastRows = rows
  }

  /** Force a full repaint (used on SIGWINCH / theme change). */
  invalidate(): void {
    this.#lastRows = []
    this.#schedule()
  }
}
