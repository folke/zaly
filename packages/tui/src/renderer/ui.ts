import type { MountCtx, RenderCtx } from "../core/ctx.ts"
import type { Node } from "../core/node.ts"
import type { Box } from "../widgets/box.ts"
import type { Terminal } from "./terminal.ts"

import { createNode } from "../core/reactive.ts"
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
export interface UIOptions {
  /**
   * Upper bound on footer height. Renders taller than this are clipped
   * to the top `maxHeight` rows. Default: one third of viewport.
   */
  maxHeight?: number
}

export class UI extends Surface {
  readonly #root: Box = box({ flexDirection: "column" })
  #rows: string[] = []
  readonly #maxHeight: number | undefined

  constructor(
    private readonly terminal: Terminal,
    private readonly getCtx: () => RenderCtx,
    opts: UIOptions = {}
  ) {
    super()
    this.#maxHeight = opts.maxHeight
    // Tag the root as scope `"global"` — the input router resolves
    // `"global.*"` keymap bindings by walking the focused node's parent
    // chain, and any focusable widget ultimately parents to this root.
    // So this tagging is what makes globals fire on every keystroke
    // without a dedicated always-matching path in the router.
    this.#root.id("global")
    // Root invalidates propagate to us via the parent chain (no parent
    // set above — the UI owns the root). Subscribe directly.
    this.#root.on("invalidate", this.onDirty)
    // The root is *not* mounted here — it mounts on `Renderer.start()`
    // via `onStart`. Deferring means widgets added to the footer tree
    // (e.g. a Spinner) don't fire their `mount` handler before the
    // renderer is actually rendering.
  }

  /** The footer's root Box. Add children via `ui.root.add(child)`. */
  get root(): Box {
    return this.#root
  }

  /** Shortcut: add a child to the footer root. Same semantics as
   *  `ui.root.add(child)`; returns `this` for chaining.
   *
   *  Function form: `add(() => box(…))` runs the function inside a
   *  fresh Owner scope (so `signal` / `effect` / `onCleanup` /
   *  `provideContext` inside `fn` attach to that scope) and adds the
   *  returned Node. The Owner disposes when the Node unmounts. */
  add(child: Node | (() => Node)): this {
    this.#root.add(createNode(child))
    return this
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
  async render(sync?: (fn: () => void) => void): Promise<void> {
    const run = sync ?? ((fn: () => void) => this.terminal.sync(fn))
    const ctx = this.getCtx()
    const rendered = await this.#root.render({ ...ctx, width: this.terminal.cols })
    const cap = this.#maxHeight ?? Math.max(1, Math.floor(this.terminal.rows / 3))
    const rows = rendered.slice(0, cap)

    // Snapshot the currently-painted rows BEFORE writing `this.#rows`.
    // The paint closure can run deferred (when a capture `sync` is
    // provided), by which point `this.#rows` has already been swapped
    // to the new slice — so the diff comparison needs the old values.
    const prevRows = this.#rows
    const prevHeight = prevRows.length
    const nextHeight = rows.length

    run(() => {
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
        if (prevRows[i] === rows[i] && prevHeight === nextHeight) continue
        this.terminal.write(this.terminal.moveTo(top + i, 1) + this.terminal.clearLine() + rows[i])
      }
    })

    this.#rows = rows
  }

  /**
   * Force a full repaint of the currently-painted footer rows on the
   * next render. Replaces each cached row with `""` so the diff sees
   * every slot as changed and rewrites it in place — without shrinking
   * the array. Emptying it entirely would fool the grow/shrink math
   * into thinking the footer just appeared (`prevHeight === 0`), so
   * it'd emit `scrollUp(nextHeight)` to make room for a footer that's
   * already on screen, visibly scrolling the stream up by N rows.
   */
  invalidate(): void {
    this.#rows = this.#rows.map(() => "")
    this.emit("dirty")
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
    this.emit("dirty")
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
}
