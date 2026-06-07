import type { MountCtx } from "../core/ctx.ts"
import type { Node } from "../core/node.ts"
import type { Box } from "../widgets/box.ts"
import type { RenderFrame } from "./frame.ts"
import type { Renderer } from "./renderer.ts"

import { createNode, withOwner } from "../core/reactive.ts"
import { box } from "../widgets/box.ts"
import { Surface } from "./surface.ts"

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
export class UI extends Surface {
  readonly type = "ui"
  readonly #root: Box = box({ flexDirection: "column" })
  #rows: string[] = []

  constructor(renderer: Renderer) {
    super(renderer)
    // Root invalidates propagate to us via the parent chain (no parent
    // set above — the UI owns the root). Subscribe directly.
    this.#root.on("invalidate", this.invalidate)
  }

  /** The footer's root Box. Add children via `ui.root.add(child)`. */
  get root(): Box {
    return this.#root
  }

  get terminal() {
    return this.$r.terminal
  }

  /** Shortcut: add a child to the footer root. Same semantics as
   *  `ui.root.add(child)`; returns `this` for chaining.
   *
   *  Function form: `add(() => box(…))` runs the function inside a
   *  fresh Owner scope (so `signal` / `effect` / `onCleanup` /
   *  `provideContext` inside `fn` attach to that scope) and adds the
   *  returned Node. The Owner disposes when the Node unmounts. */
  add<N extends Node>(child: () => N): N {
    const ret = withOwner(this.$r.rootOwner, () => createNode(child))
    this.#root.add(ret)
    return ret
  }

  /** Current rendered height (rows). */
  get height(): number {
    return this.#rows.length
  }

  /**
   * The rows currently painted into the footer region, in order from the
   * top of the reserved area downward. Exposed so the overlay surface
   * can re-emit this content after it tears down, without re-rendering
   * the tree.
   */
  get rows(): readonly string[] {
    return this.#rows
  }

  /**
   * Render the footer tree and paint the diff against the last paint.
   * Updates the terminal's reservation whenever the height changes so
   * the scroll region stays correctly sized.
   *
   * When called from `Renderer.render()`, a capture-style `sync` is
   * provided so all surfaces paint inside one atomic sync frame. Direct
   * callers (tests) omit it and get an immediate `terminal.sync`.
   */
  async _render(frame: RenderFrame): Promise<void> {
    const ctx = this.$r.ctx
    const rendered = await this.#root.render({ ...ctx, width: this.terminal.cols })
    const visible = Math.max(0, this.terminal.rows - 1)
    const rows = rendered.length > visible ? rendered.slice(-visible) : rendered
    const prevHeight = this.#rows.length
    const nextHeight = rows.length

    // Resize the reserved bottom to match the new footer height.
    // Reissues DECSTBM — stream's next flush sees a different
    // `scrollBottom` and re-slices its virtual buffer to fit. Footer-grow no
    // longer commits stream rows to scrollback — they stay addressable, ready
    // to reappear when the footer shrinks back.
    if (nextHeight !== this.terminal.reserveBottom) {
      frame.flush()
      frame.queue((terminal) => terminal.setReserveBottom(nextHeight))
      this.$r.stream.invalidate()
    }

    const top = this.terminal.rows - nextHeight + 1
    const prevTop = this.terminal.rows - prevHeight + 1
    for (let row = prevTop; row < top; row++) frame.clear(row)
    for (let i = 0; i < nextHeight; i++) frame.set(top + i, rows[i])

    this.#rows = rows
  }

  /**
   * Terminal was resized. Drop the painted-rows mirror so the next
   * render's grow/shrink math treats the footer as if it's just
   * appearing — correct after a screen clear, when the terminal no
   * longer holds any footer bytes. The scroll region gets re-established
   * through the normal `setReserveBottom` path inside `render()`.
   */
  onResize(): void {
    this.#rows = []
    this.invalidate()
  }

  /** UI's tracked node set is just the footer root. */
  get nodes(): readonly Node[] {
    return [this.#root]
  }

  protected mountAll(ctx: MountCtx): void {
    if (!this.#root.mounted) this.#root.mount(ctx)
  }

  protected unmountAll(): void {
    if (this.#root.mounted) this.#root.unmount()
  }

  get bounds(): { top: number; bottom: number } {
    const top = this.terminal.footerTop
    return { bottom: this.terminal.rows, top }
  }
}
