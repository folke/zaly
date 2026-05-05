import type { RenderCtx } from "../core/ctx.ts"
import type { Reactive } from "../core/reactive.ts"

import { Node } from "../core/node.ts"
import { unwrap } from "../core/reactive.ts"

export interface ShowState {
  /** Predicate. Truthy → render `children`; falsy → render `fallback`
   *  (or nothing). Defaults to `true`. Accepts a signal accessor — the
   *  Show node subscribes via `unwrap` and re-renders on flips. */
  when?: Reactive<boolean>
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
  protected async _render(ctx: RenderCtx): Promise<string[]> {
    const cond = unwrap(this.state.when ?? true)
    const fb = this.state.fallback
    let targets: readonly Node[]
    if (cond) targets = fb === undefined ? this.children : this.children.filter((c) => c !== fb)
    else targets = fb === undefined ? [] : [fb]
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
