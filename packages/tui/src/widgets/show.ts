import type { RenderCtx } from "../core/ctx.ts"
import type { Reactive } from "../core/reactive.ts"

import { Node } from "../core/node.ts"
import { unwrap } from "../core/reactive.ts"

export interface ShowState<T = unknown> {
  /** Predicate. Truthy → render `children`; falsy → render `fallback`
   *  (or nothing). Defaults to `true`. Accepts a signal accessor — the
   *  Show node subscribes via `unwrap` and re-renders on flips. */
  when?: Reactive<T | undefined | false | null>
  /** Rendered when `when` is falsy. Optional. */
  fallback?: Node
}

/**
 * Conditional render. When `when` is truthy, the children render
 * stacked as a transparent fragment; when falsy, `fallback` renders if
 * provided, else nothing.
 *
 * Both branches are mounted as Node children, so lifecycle hooks fire
 * once and stay alive across toggles — no remount churn for spinners /
 * timers / signal subscriptions in the inactive branch. The hidden
 * branch contributes zero rows, same footprint as `visible: false`.
 */
export class Show extends Node<ShowState> {
  /** Fragment protocol — Box's layout calls this to expand Show into
   *  whichever subtree is currently active. Reading `when` here
   *  subscribes the *layout-parent's* tracking ctx (Box) so flips
   *  re-render the parent and flow updated children through layout
   *  cleanly. */
  override layoutChildren(): readonly Node[] {
    const cond = !!unwrap(this.state.when ?? true)
    const fb = this.state.fallback
    if (!cond) return fb === undefined ? [] : [fb]
    return this.children.filter((c) => c !== fb)
  }

  /** Standalone-render fallback. Box parents go through
   *  `layoutChildren` and bypass this; only fires when `Show` sits
   *  outside a layout container (root, overlay, etc.). */
  protected async _render(ctx: RenderCtx): Promise<string[]> {
    const targets = this.layoutChildren()
    const rows = await Promise.all(targets.map((c) => c.render(ctx)))
    return rows.flat()
  }
}

/**
 * Factory for `Show`. Mirrors `box(state, ...children)` ergonomics:
 * `state.fallback` is added to the children list so it mounts
 * alongside the main branch and stays alive across toggles; `_render`
 * picks which subset to paint.
 *
 * ```ts
 * show({ when: isLoading }, spinner({ color: "accent" }))
 * show({ when: hasError, fallback: text("ok") }, text("error", { fg: "red" }))
 * show({ when: showDetails }, box({}, ...detailRows))
 * ```
 */
export function show(state: ShowState, ...children: Node[]): Show {
  const s = new Show(state)
  for (const c of children) s.add(c)
  if (state.fallback !== undefined) s.add(state.fallback)
  return s
}
