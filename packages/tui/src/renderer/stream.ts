import type { MountCtx } from "../core/ctx.ts"
import type { Node } from "../core/node.ts"
import type { SuspenseBoundary } from "../core/reactive.ts"
import type { Renderer } from "./renderer.ts"
import type { Terminal } from "./terminal.ts"

import { throttle } from "@zaly/shared/throttle"
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
  scroll: { offset: number; total: number; below: number }
}

type RenderState = {
  /** Rows from this state that have already entered terminal scrollback.
   *  Scrollback is immutable, so later renders may only replace rows after
   *  this committed prefix. */
  commit: number
  dirty: boolean
  live: boolean
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
  freeze: () => void
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
function findFrozenPrefixEnd(rendered: string[], frozen: string[]): number {
  if (frozen.length === 0) return 0
  for (let start = 0; start <= rendered.length - frozen.length; start++) {
    let match = true
    for (let i = 0; i < frozen.length; i++) {
      if (rendered[start + i] !== frozen[i]) {
        match = false
        break
      }
    }
    if (match) return start + frozen.length
  }
  return frozen.length
}

const SCROLL_DURATION = 120

export class Stream extends Surface<StreamEvents> {
  readonly type = "stream"
  #state: RenderState[] = []
  #rows: string[] = []
  /** Bottom row of the live region the last time we painted. Used to
   *  compute where `#rows` actually live on screen when the footer
   *  resizes between renders (scrollBottom moves). Without this we'd
   *  derive `oldTopRow` from the *current* scrollBottom, which is wrong
   *  after a footer grow/shrink. */
  #prevBottom: number | undefined
  #opts: StreamOptions
  #scrollback: string[] = []
  #historyLength = 0
  /** 0 = follow live bottom; otherwise 1-based top row inside history. */
  #scrollTop = 0
  #wasVirtual = false
  #hasKittyImages = false
  #scrollAnim?: { cancel: () => void }

  constructor(renderer: Renderer, opts: Partial<StreamOptions> = {}) {
    super(renderer)
    this.#opts = {
      fixedFooterHeight: opts.fixedFooterHeight ?? 0,
      maxLive: opts.maxLive ?? 3,
    }
    this.emitScroll = throttle(this.emitScroll.bind(this), 1000 / 60)
  }

  get bounds(): { top: number; bottom: number } {
    return { bottom: this.terminal.scrollBottom, top: 1 }
  }

  get terminal(): Terminal {
    return this.$r.terminal
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
    const resolved = withOwner(this.$r.rootOwner, () =>
      createNode(() => {
        provideContext(SuspenseContext, boundary)
        return node()
      })
    )

    const invalidate = () => {
      state.dirty = true
      this.invalidate()
    }

    const state = {
      boundary,
      commit: 0,
      dirty: true,
      freeze: () => {
        if (state.node.mounted) state.node.unmount()
        state.node.off("invalidate", invalidate)
      },
      get live() {
        return this.boundary.active() || this.dirty || !!this.node.state.sticky
      },
      node: resolved,
    }

    this.#state.push(state)
    const ctx = this.mountCtx
    if (this.running && ctx) resolved.mount(ctx)

    resolved.on("invalidate", invalidate)

    this.invalidate()
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
    if (!this.pending) return
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

  emitScroll(): void {
    setImmediate(() => {
      void this.emit("scroll", {
        below:
          this.#scrollTop === 0 ? 0 : this.#historyLength - this.#scrollTop - this.liveHeight + 1,
        offset: this.#scrollTop === 0 ? this.#historyLength : this.#scrollTop,
        total: this.#historyLength,
      })
    })
  }

  scroll(lines = 0.5): Promise<void> {
    const amount = Math.trunc(Math.abs(lines) < 1 ? lines * this.liveHeight : lines)
    if (amount === 0) return Promise.resolve()

    const total = this.#historyLength
    const maxTop = Math.max(1, total - this.liveHeight + 1)
    const current = this.#scrollTop === 0 ? maxTop : this.#scrollTop
    const target = Math.max(1, Math.min(maxTop, current + amount))
    if (target === current) return Promise.resolve()

    this.#scrollAnim?.cancel()

    const ret = Promise.withResolvers<void>()

    const delta = Math.abs(target - current)
    const dir = Math.sign(target - current)
    const stepTime = Math.max(8, Math.min(16, SCROLL_DURATION / delta))
    const stepAmount = Math.max(1, Math.ceil(delta / Math.ceil(SCROLL_DURATION / stepTime)))

    const tick = () => {
      const lastTop = Math.max(1, this.#historyLength - this.liveHeight + 1)
      const top = this.#scrollTop === 0 ? lastTop : this.#scrollTop
      const remaining = Math.abs(target - top)
      if (remaining === 0) {
        this.#scrollTop = target >= lastTop ? 0 : target
        this.emitScroll()
        ret.resolve()
        this.#scrollAnim = undefined
        return
      }

      const step = Math.min(stepAmount, remaining)
      const next = top + dir * step
      this.#scrollTop = next >= lastTop ? 0 : next
      this.emitScroll()
      this.invalidate()

      const t = setTimeout(tick, stepTime)
      t.unref()
      this.#scrollAnim = {
        cancel: () => {
          clearTimeout(t)
          ret.resolve()
          this.#scrollAnim = undefined
        },
      }
    }

    tick()
    return ret.promise
  }

  async scrollBottom(): Promise<void> {
    if (this.#scrollTop === 0) return
    await this.scroll(Math.max(1, this.#historyLength - this.liveHeight + 1))
    if (this.#scrollTop === 0) return // Already at target
    if (this.#scrollAnim) return // Another scroll started during the scroll-bottom animation; don't override it with a hard jump
    this.#scrollTop = 0
    this.emitScroll()
    this.invalidate()
  }

  scrollTop(): Promise<void> {
    return this.scroll(-this.#historyLength + 1)
  }

  scrollUp(lines = 0.5): Promise<void> {
    return this.scroll(-lines)
  }

  scrollDown(lines = 0.5): Promise<void> {
    return this.scroll(lines)
  }

  async #render(): Promise<{ commitLimit: number; rows: string[] }> {
    const ctx = this.$r.ctx

    // Render tracked nodes. Node.render() owns cache invalidation, so clean
    // nodes return cached rows immediately; Stream only preserves the
    // previous row count when a node shrinks so stale terminal rows clear.
    await Promise.all(
      this.#state.map(async (s) => {
        const prev = s.rows ?? []
        const len = prev.length
        const frozen = prev.slice(0, s.commit)
        s.dirty = false
        const rendered = await s.node.render(ctx)
        const mutableStart = s.commit === 0 ? 0 : findFrozenPrefixEnd(rendered, frozen)
        s.rows = [...frozen, ...rendered.slice(mutableStart)]
        if (s.rows.length < len) s.rows.push(...Array(len - s.rows.length).fill(""))
      })
    )

    // Let promise callbacks scheduled by createAsync during render run before
    // deciding what can enter scrollback. If a resource resolved immediately,
    // its setValue() invalidates the node here, keeping this state live for
    // one more frame instead of committing initial/fallback rows.
    await Promise.resolve()

    // Push sticky nodes to the end so they paint last and end up at the bottom
    const states: RenderState[] = []
    const sticky: RenderState[] = []
    for (const s of this.#state) {
      if (s.node.state.sticky) sticky.push(s)
      else states.push(s)
    }
    states.push(...sticky)
    this.#state = [...states]

    const rows: string[] = []
    let commitLimit: number | undefined
    for (const s of this.#state) {
      if (commitLimit === undefined && s.live) commitLimit = rows.length
      if (s.rows) rows.push(...s.rows)
    }
    return { commitLimit: commitLimit ?? rows.length, rows }
  }

  async _render(run: (fn: () => void) => void): Promise<void> {
    const { commitLimit, rows: allRows } = await this.#render()
    const liveHeight = this.liveHeight
    const bottom = this.terminal.scrollBottom
    const terminalRows = this.terminal.rows
    const oldCC = this.#committedRows()
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
    const newCC = Math.min(commitLimit, Math.max(oldCC, allRows.length - commitThreshold))
    const commitCount = newCC - oldCC
    const commitRows = allRows.slice(oldCC, newCC)
    const liveRows = allRows.slice(newCC)
    const historyLength = this.#scrollback.length + commitRows.length + liveRows.length
    const maxTop = Math.max(1, historyLength - liveHeight + 1)
    if (this.#scrollTop > maxTop) this.#scrollTop = 0

    // Bottom-anchored slice of (post-commit) addressable: the rows
    // that actually paint in the scroll region.
    let newVisible = liveRows.slice(-liveHeight)
    const historyChanged = this.#historyLength !== historyLength
    this.#scrollback.push(...commitRows)
    this.#historyLength = historyLength

    if (this.#scrollTop > 0) {
      if (historyChanged) this.emitScroll()
      const start = this.#scrollTop - 1
      const end = start + liveHeight
      const scrollbackEnd = this.#scrollback.length
      newVisible = this.#scrollback.slice(start, end)
      if (newVisible.length < liveHeight) {
        const liveStart = Math.max(0, start - scrollbackEnd)
        newVisible.push(...liveRows.slice(liveStart, liveStart + liveHeight - newVisible.length))
      }
    }

    const newTopRow = bottom - newVisible.length + 1
    const virtual = this.#scrollTop > 0
    const hasKittyImages = newVisible.some((row) => row.includes("\x1b_Ga=p"))
    const resetImages = (virtual || this.#wasVirtual) && (this.#hasKittyImages || hasKittyImages)
    this.#wasVirtual = virtual

    // Snapshot + clear now so the paint closure (possibly deferred via
    // the Renderer's capture) doesn't race with new `markStale` calls.
    const stale = this.clearStale()

    // Diff check: does screen position `row` already hold `expected`?
    //   - `row`: target absolute screen row.
    //   - `shift`: how many `\n`-commits have happened in this frame
    //     before this check (0 for the pre-commit pass, `commitCount`
    //     for the post-commit visible paint). Pre-shift, this position
    //     held content from row `row + shift`.
    // Skipped on layout shift (`oldBottom !== bottom`), stale rows,
    // and out-of-range `oldVisible` indices.
    const screenAlreadyMatches = (row: number, expected: string, shift: number): boolean => {
      if (virtual || oldBottom !== bottom) return false
      const preShiftRow = row + shift
      if (stale.has(preShiftRow)) return false
      const oldIdx = preShiftRow - oldTopRow
      if (oldIdx < 0 || oldIdx >= oldVisible.length) return false
      return oldVisible[oldIdx] === expected
    }

    run(() => {
      if (resetImages) this.terminal.deleteImages({ data: false })
      // Stale-clear: rows in `#stale` that aren't covered by the
      // visible paint loop below. Inside-visible rows are handled by
      // the diff (force-write via `stale.has`). Anything above the new
      // visible paint area still has overlay bytes and would otherwise
      // be \n'd into scrollback during a commit — clear first.
      for (const r of stale) {
        if (r < 1 || r > bottom) continue
        if (commitCount === 0 && r >= newTopRow && r <= bottom) continue
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
    this.#hasKittyImages = hasKittyImages

    // Mark newly-promoted rows on their owning states. This keeps the
    // immutable scrollback boundary local to each retained node, so later
    // mutations above the boundary can't shift already-promoted rows and
    // make us write the same semantic row to scrollback again.
    let remaining = commitCount
    for (const s of this.#state) {
      if (remaining <= 0) break
      const len = s.rows?.length ?? 0
      const n = Math.min(remaining, Math.max(0, len - s.commit))
      s.commit += n
      remaining -= n
    }

    // Drop states whose rows have entirely entered scrollback. Their
    // committed rows leave `allRows` on the next tick; the global committed
    // count is derived from retained states, so no separate adjustment is
    // needed.
    while (this.#state.length > 0) {
      const first = this.#state[0]
      const len = first.rows?.length ?? 0
      if (first.live || first.commit < len) break
      this.#state.shift()
      first.freeze()
    }

    if (!this.pending) void this.emit("idle")
  }

  #committedRows(): number {
    return this.#state.reduce((sum, s) => sum + s.commit, 0)
  }

  get pending() {
    return this.active
  }

  get active() {
    return this.#state.some((s) => s.boundary.active())
  }

  /**
   * Terminal was resized. Forget only the paint mirror that mapped stream
   * rows onto the old screen geometry. App scrollback and per-state commit
   * boundaries are preserved; retained nodes re-render at the new width
   * through Node.render()'s cache key.
   *
   * Paired with a screen-clear in the Renderer's resize handler — this
   * method only resets our mirror of what's on screen; the actual wipe
   * and re-establishment of DECSTBM lives in the terminal-level handler.
   */
  onResize(): void {
    this.resetPaint()
  }

  resetPaint(): void {
    this.#rows = []
    this.#scrollAnim?.cancel()
    this.clearStale()
    this.#prevBottom = undefined
    this.#hasKittyImages = false
    this.invalidate()
  }

  reset(opts: { keepNodes?: boolean } = {}): void {
    this.resetPaint()
    this.#scrollback = []
    this.#historyLength = 0
    this.#scrollTop = 0
    for (const s of this.#state) s.commit = 0
    if (!opts.keepNodes) {
      for (const s of this.#state) s.freeze()
      this.#state = []
    }
  }

  protected mountAll(ctx: MountCtx): void {
    // Mark every row in the current scroll region as stale on start.
    // Pre-zaly content sitting in the terminal would otherwise stay on
    // screen above stream's bottom-anchored paint, and — worse — get
    // `\n`-promoted into scrollback once the stream grows past the
    // commit threshold. Marking stale forces an explicit clear (above
    // the visible paint area) or a diff miss (inside).
    this.markStale()
    for (const s of this.#state) if (!s.node.mounted) s.node.mount(ctx)
  }

  protected unmountAll(): void {
    // Tracked state (`#state`) is preserved so a subsequent `onStart()`
    // finds the same tree and remounts it.
    for (const s of this.#state) if (s.node.mounted) s.node.unmount()
  }
}
