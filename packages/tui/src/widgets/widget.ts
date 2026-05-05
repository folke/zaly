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
/** When every field of `P` is optional (so `{}` satisfies it), the
 *  props arg can be omitted at the call site — `status()` instead of
 *  `status({})`. Otherwise it's required. */
type WidgetArgs<P> = {} extends P ? [props?: P] : [props: P]

export function widget<S extends {}, N extends Node = Node>(
  fn: (props: S & BaseState) => N
): (...args: WidgetArgs<S & BaseState>) => WidgetNode<S, N> {
  return ((props?: S & BaseState) => new WidgetNode(fn, (props ?? {}) as S & BaseState)) as (
    ...args: WidgetArgs<S & BaseState>
  ) => WidgetNode<S, N>
}

class WidgetNode<S extends {}, N extends Node = Node> extends Node<S & BaseState> {
  readonly #create: (props: S) => N
  #child?: N

  constructor(fn: (props: S) => N, props: S) {
    super(props)
    this.#create = fn
  }

  get child(): N {
    if (this.#child === undefined) {
      throw new Error(
        "WidgetNode.child accessed before first render — body runs lazily in `_render`. " +
          "Call `await widget.render(ctx)` first if you need to inspect the inner tree."
      )
    }
    return this.#child
  }

  async _render(ctx: RenderCtx): Promise<string[]> {
    if (this.#child === undefined) {
      this.#child = this.#create(this.state) // runs ONCE; props is captured by closure
      this.add(this.#child) // adopt as real child so layout/parent ops work
    }
    return this.#child.render(ctx)
  }
}
