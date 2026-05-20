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
import { Surface } from "./surface.ts"

export type StreamEvents = {
  idle: void
}

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
  /** Baseline ("steady state") footer height in rows. The commit-to-
   *  scrollback threshold uses `terminal.rows - fixedFooterHeight`
   *  instead of `terminal.rows`. With this set to the natural footer
   *  size (e.g. 2 for an input bar), scrollback is exactly contiguous
   *  with the visible region in steady state — no rows hidden behind
   *  the footer. Footer growth past this size (autocomplete) still
   *  hides rows temporarily; they reappear when the footer returns
   *  to baseline.
   *
   *  Default `0`: commit at full `terminal.rows` (old behavior).
   */
  fixedFooterHeight: number
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
export class Stream extends Surface<StreamEvents> {
  #state: RenderState[] = []
  #queue: RenderState[] = []
  #scrollbackCount = 0
  #rows: string[] = []
  // oxlint-disable-next-line no-unused-private-class-members
  #pumpScheduled?: Promise<void>
  /** Bottom row of the live region the last time we painted. Used to
   *  compute where `#rows` actually live on screen when the footer
   *  resizes between renders (scrollBottom moves). Without this we'd
   *  derive `oldTopRow` from the *current* scrollBottom, which is wrong
   *  after a footer grow/shrink. */
  #prevBottom: number | undefined
  /** Absolute rows the stream paint should treat as "screen doesn't
   *  match our mirror." Populated by `markStale` when another surface
   *  (overlay) writes into the scroll region. The render handles each
   *  stale row one of two ways:
   *
   *    - If above the visible paint area: explicit `clearLine` write
   *      before any `\n`-scroll, so overlay bytes never get promoted
   *      into scrollback.
   *    - If inside the visible paint area: forced as a "diff miss" in
   *      the visible paint loop so the row gets rewritten with correct
   *      stream content, regardless of whether `oldVisible[k]` claims
   *      it already matches.
   *
   *  Cleared at end of each render. */
  readonly #stale = new Set<number>()
  #opts: StreamOptions

  constructor(
    private readonly terminal: Terminal,
    private readonly getCtx: () => RenderCtx,
    private readonly rootOwner: Owner,
    opts: Partial<StreamOptions> = {}
  ) {
    super()
    this.#opts = {
      fixedFooterHeight: opts.fixedFooterHeight ?? 0,
      maxLive: opts.maxLive ?? 3,
    }
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
    this.#queue.push({ boundary, live: true, node: resolved })
    const ctx = this.mountCtx
    if (this.running && ctx) resolved.mount(ctx)
    resolved.on("invalidate", this.onDirty)
    //this.commit({ keep: this.#opts.maxLive, render: false })
    void this.emit("dirty")
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

  async waitIdle(): Promise<void> {
    if (!this.asyncPending && this.#queue.length === 0) return
    await new Promise((resolve) => this.once("idle", resolve))
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
          const len = s.rows?.length ?? 0
          s.rows = await s.node.render(ctx)
          if (s.rows.length < len) s.rows.push(...Array(len - s.rows.length).fill(""))
          s.version = ctx.version
        }
      })
    )

    const allRows: string[] = []
    for (const s of states) if (s.rows) allRows.push(...s.rows)

    const liveHeight = this.liveHeight
    const bottom = this.terminal.scrollBottom
    const terminalRows = this.terminal.rows
    const oldCC = this.#scrollbackCount
    const oldVisible = this.#rows
    const oldBottom = this.#prevBottom ?? bottom
    const oldTopRow = oldBottom - oldVisible.length + 1

    // Commit threshold = the *full terminal minus the baseline footer
    // height*. Steady state (footer == fixedFooterHeight) keeps
    // scrollback exactly contiguous with the visible region — no
    // hidden rows. Footer growth above baseline (autocomplete) still
    // hides rows temporarily but they're recoverable when the footer
    // shrinks back. `fixedFooterHeight = 0` reduces to "commit at the
    // full terminal" (old behavior).
    const commitThreshold = Math.max(1, terminalRows - this.#opts.fixedFooterHeight)
    const newCC = Math.max(oldCC, allRows.length - commitThreshold)
    const commitCount = newCC - oldCC
    // Bottom-anchored slice of (post-commit) addressable: the rows
    // that actually paint in the scroll region.
    const newVisible = allRows.slice(newCC).slice(-liveHeight)
    const newTopRow = bottom - newVisible.length + 1

    // Snapshot + clear now so the paint closure (possibly deferred via
    // the Renderer's capture) doesn't race with new `markStale` calls.
    const stale = new Set(this.#stale)
    this.#stale.clear()

    // Diff check: does screen position `row` already hold `expected`?
    //   - `row`: target absolute screen row.
    //   - `shift`: how many `\n`-commits have happened in this frame
    //     before this check (0 for the pre-commit pass, `commitCount`
    //     for the post-commit visible paint). Pre-shift, this position
    //     held content from row `row + shift`.
    // Skipped on layout shift (`oldBottom !== bottom`), stale rows,
    // and out-of-range `oldVisible` indices.
    const screenAlreadyMatches = (row: number, expected: string, shift: number): boolean => {
      if (oldBottom !== bottom) return false
      const preShiftRow = row + shift
      if (stale.has(preShiftRow)) return false
      const oldIdx = preShiftRow - oldTopRow
      if (oldIdx < 0 || oldIdx >= oldVisible.length) return false
      return oldVisible[oldIdx] === expected
    }

    run(() => {
      // Stale-clear: rows in `#stale` that aren't covered by the
      // visible paint loop below. Inside-visible rows are handled by
      // the diff (force-write via `stale.has`). Anything above the new
      // visible paint area still has overlay bytes and would otherwise
      // be \n'd into scrollback during a commit — clear first.
      for (const r of stale) {
        if (r < 1 || r > bottom) continue
        if (r >= newTopRow && r <= bottom) continue
        this.terminal.write(this.terminal.moveTo(r, 1) + this.terminal.clearLine())
      }

      // Commit `commitCount` rows to scrollback. Paint each batch of
      // to-be-committed rows at the top of the scroll region, then
      // \n them off. Batched because the scroll region only has
      // `liveHeight` rows — a single render that crosses the threshold
      // by more than `liveHeight` (e.g. a freshly-mounted node taller
      // than the live region) needs multiple paint/scroll passes.
      //
      // The paint-before-\n positioning ensures the row that lands in
      // scrollback is the one we actually want (`allRows[oldCC + i]`),
      // independent of what the previous render painted there. The
      // first batch's writes can be skipped when the row already holds
      // the right bytes (steady-state streaming case — the row was the
      // top of the previous frame's bottom-anchored visible).
      let i = 0
      while (i < commitCount) {
        const batch = Math.min(commitCount - i, liveHeight)
        for (let j = 0; j < batch; j++) {
          const row = 1 + j
          const content = allRows[oldCC + i + j]
          // Diff only the first batch — subsequent batches start from
          // post-`\n` state which `oldVisible` doesn't model.
          if (i === 0 && screenAlreadyMatches(row, content, 0)) continue
          this.terminal.write(this.terminal.moveTo(row, 1) + this.terminal.clearLine() + content)
        }
        this.terminal.write(this.terminal.moveTo(bottom, 1))
        for (let j = 0; j < batch; j++) this.terminal.write("\n")
        i += batch
      }

      // Clear rows that should be blank above the visible paint area.
      // Two cases:
      //   (a) Layout shift (footer resized): rows that were stream's
      //       previous paint area but aren't in the new one need
      //       clearing.
      //   (b) After commits, content from rows above the prev visible
      //       region may have been `\n`-shifted into rows 1..newTopRow-1
      //       (because the `\n` shifts the *entire* scroll region, not
      //       just our paint area). Clear those so they don't carry
      //       ghost content into the area above stream's bottom-anchor.
      const clearTop = oldBottom !== bottom ? Math.max(1, Math.min(oldTopRow, newTopRow)) : 1
      for (let r = clearTop; r < newTopRow; r++) {
        if (r < 1 || r > bottom) continue
        this.terminal.write(this.terminal.moveTo(r, 1) + this.terminal.clearLine())
      }

      // Paint the visible region. Each row checks against `oldVisible`
      // shifted up by `commitCount` (post-`\n` state). In the streaming
      // case (commitCount = 1, region full, newTopRow == oldTopRow)
      // this skips every write except the last.
      for (let k = 0; k < newVisible.length; k++) {
        const row = newTopRow + k
        if (screenAlreadyMatches(row, newVisible[k], commitCount)) continue
        this.terminal.write(
          this.terminal.moveTo(row, 1) + this.terminal.clearLine() + newVisible[k]
        )
      }
    })

    this.#rows = newVisible
    this.#prevBottom = bottom

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
    this.pump()
  }

  pump() {
    const active = this.#state.filter((s) => s.boundary.active())
    // When no async work is pending, schedule the next queued node
    if (active.length) {
      this.#pumpScheduled ??= Promise.all(active.map((s) => s.boundary.whenIdle())).then(() => {
        this.#pumpScheduled = undefined
        this.pump()
      })
    } else {
      const next = this.#queue.shift()
      if (next) {
        this.#state.push(next)
        this.commit({ keep: this.#opts.maxLive, render: false })
        this.onDirty()
      } else void this.emit("idle")
    }
  }

  get asyncPending() {
    return this.#state.some((s) => s.boundary.active())
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
    if (changed && render) void this.emit("dirty")
  }

  /**
   * Force a full repaint of the currently-visible stream rows on the
   * next render. Marks each currently-painted row as stale so the
   * diff is forced to rewrite it. We don't shrink `#rows` — the
   * tracked length feeds the diff's bottom-anchored mapping.
   */
  invalidate(): void {
    const top = (this.#prevBottom ?? this.terminal.scrollBottom) - this.#rows.length + 1
    for (let i = 0; i < this.#rows.length; i++) this.#stale.add(top + i)
    void this.emit("dirty")
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
    this.#stale.clear()
    this.#prevBottom = undefined
    void this.emit("dirty")
  }

  /**
   * Mark a range of absolute rows (inclusive) as stale. The next
   * render's diff treats them as "screen doesn't match our mirror"
   * and forces a rewrite (inside the visible region) or explicit
   * clear (above the visible region, before any `\n`-scroll).
   *
   * Typical caller: the overlay surface when an overlay paints over
   * rows the stream "owns" — those rows now have overlay bytes, not
   * stream bytes, and need rewriting on overlay close.
   *
   * No `"dirty"` emit — callers own their own scheduling.
   */
  markStale(fromRow: number, toRow: number): void {
    const bottom = this.terminal.scrollBottom
    for (let r = fromRow; r <= toRow; r++) {
      if (r >= 1 && r <= bottom) this.#stale.add(r)
    }
  }

  protected mountAll(ctx: MountCtx): void {
    // Mark every row in the current scroll region as stale on start.
    // Pre-zaly content sitting in the terminal would otherwise stay on
    // screen above stream's bottom-anchored paint, and — worse — get
    // `\n`-promoted into scrollback once the stream grows past the
    // commit threshold. Marking stale forces an explicit clear (above
    // the visible paint area) or a diff miss (inside).
    for (let r = 1; r <= this.terminal.scrollBottom; r++) this.#stale.add(r)
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
