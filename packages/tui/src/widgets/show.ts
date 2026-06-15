import type { RenderCtx } from "../core/ctx.ts"
import type { Reactive } from "../core/reactive.ts"

import { Node } from "../core/node.ts"
import { untrack, unwrap, useActiveOwner, withOwner } from "../core/reactive.ts"

export type ShowGate = { when: Reactive<unknown> }
export type ShowBranch = { when: Reactive<unknown>; use: ShowChildren }
export type ShowChildren = () => Node | Node[]
export type ShowSpec = (ShowGate | ShowBranch)[] | [...(ShowGate | ShowBranch)[], ShowChildren]

type ShowState = {
  when: Reactive<unknown>
  use?: ShowChildren
  children?: Node[]
}

export type { Show }

/** Conditional fragment backing `show()`. Branches are created lazily:
 * a `use` factory only runs the first time its condition wins. Once
 * created, the branch remains mounted and owned; inactive branches simply
 * don't participate in layout/rendering and contribute zero rows.
 *
 * Lazy factories run under the owner captured at `show()` creation time,
 * so context reads behave as if the branch had been constructed eagerly.
 */
class Show extends Node {
  #state: ShowState[] = []
  #owner = useActiveOwner()

  constructor(spec: ShowSpec) {
    super({})
    let fallback = false
    for (const s of spec) {
      if (fallback) throw new Error("Show: `fallback` must be the final argument")
      if (typeof s === "function") {
        this.#state.push({ use: s, when: true })
        fallback = true
      } else this.#state.push(s)
    }
  }

  #nodes(s: ShowState, use: ShowChildren): Node[] {
    if (s.children) return s.children
    const create = () => untrack(use)
    const nodes = this.#owner ? withOwner(this.#owner, create) : create()
    s.children = Array.isArray(nodes) ? nodes : [nodes]
    for (const c of s.children) this.add(c)
    return s.children
  }

  override layoutChildren(): readonly Node[] {
    for (const s of this.#state) {
      const matches = unwrap(s.when)
      if (s.use === undefined) {
        if (!matches) return []
        continue
      } else if (!matches) continue
      return this.#nodes(s, s.use)
    }
    return []
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

/** Lazy conditional rendering.
 *
 * Specs are evaluated from left to right:
 * - `{ when }` is a guard. When false, rendering stops with no rows; when
 *   true, evaluation continues.
 * - `{ when, use }` is a conditional branch. The first branch whose
 *   condition is truthy is rendered.
 * - A final bare factory is the fallback branch and must be the last
 *   argument.
 *
 * Branch factories are lazy and run at most once. Created branches stay
 * mounted across toggles, preserving state, effects, and async resources.
 *
 * ```ts
 * show({ when: isLoading }, () => spinner({ color: "accent" }))
 *
 * show(
 *   { when: full },
 *   { when: isError, use: () => errorView() },
 *   () => resultView()
 * )
 * ```
 */
export function show(...spec: ShowSpec): Show {
  return new Show(spec)
}
