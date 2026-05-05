import type { BaseState, RenderCtx } from "../core/ctx.ts"

import { Node } from "../core/node.ts"

/** A widget is a `(props) → Node` factory. Same shape as `box`/`text`
 *  themselves — props in, Node out, runs once at construction. */
export type Widget<S, N extends Node = Node> = (props: S) => N

/**
 * Type helper for declaring widgets — runtime identity, just `return fn`.
 *
 * Three things it earns:
 *   1. Inference at the declaration site: TS infers `S` from the function
 *      parameter and enforces it on every call site.
 *   2. A consistent grep target: every component reads as
 *      `export const foo = widget((props) => …)`.
 *   3. A future seam for instrumentation, lifecycle wrappers, devtools.
 *
 * The factory body runs **once** at construction. Reactive content lives
 * in leaf thunks (`text(({ style }) => …)`), not by re-running the body
 * — this is the Solid model, not React's. `ctx` is therefore unavailable
 * inside the factory; reach for it inside leaf thunks where it belongs.
 *
 * ```ts
 * const status = widget((props: { level: "ok" | "warn"; msg: string }) =>
 *   text(({ style }) => `${style.bold[props.level]("●")} ${style.dim(props.msg)}`),
 * )
 *
 * status({ level: "ok", msg: "all systems nominal" })
 * ```
 */
export function widget<S extends {}, N extends Node = Node>(
  fn: (props: S & BaseState) => N
): (props: S & BaseState) => WidgetNode<S, N> {
  return (props) => new WidgetNode(fn, props)
}

class WidgetNode<S extends {}, N extends Node = Node> extends Node<S & BaseState> {
  readonly child: N

  constructor(fn: (props: S) => N, props: S) {
    super(props)
    this.child = fn(props) // runs ONCE; props is captured by closure
    this.add(this.child) // adopt as real child so layout/parent ops work
  }

  async _render(ctx: RenderCtx): Promise<string[]> {
    return this.child.render(ctx)
  }
}
