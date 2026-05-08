import type { RenderCtx } from "../core/ctx.ts"
import type { State } from "../core/state.ts"

import { Node } from "../core/node.ts"

/** A widget is a `(props) → Node` factory. Same shape as `box`/`text`
 *  themselves — props in, Node out, runs once at construction. */
export type Widget<S, N extends Node = Node> = (props: S) => N

export type WidgetState<T extends object = object> = State<T> & { children?: readonly Node[] }

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
/**
 * Call-site args derived from `S`:
 *   - If `S` declares `children`, `children` is injected from rest args;
 *     state at the call site has `children` omitted, then `...children`.
 *   - Otherwise, no rest is allowed.
 *   - Either way, the state arg is optional when every field of the
 *     resolved state is optional (so bare `widget()` works).
 */
type WidgetArgs<S> = "children" extends keyof S
  ? {} extends Omit<S, "children">
    ? [state?: Omit<S, "children">, ...children: Node[]]
    : [state: Omit<S, "children">, ...children: Node[]]
  : {} extends S
    ? [state?: S]
    : [state: S]

export function widget<S extends object, N extends Node = Node>(
  fn: (props: State<S>) => N
): (...args: WidgetArgs<State<S>>) => WidgetNode<S, N> {
  return ((stateArg?: State<S>, ...children: Node[]) => {
    // Children always carried through props as a (possibly empty)
    // array — bodies that opt into children declare `children:
    // readonly Node[]` in their state type and read `props.children`
    // freely; bodies that don't see `[]` and ignore it.
    const state = { ...stateArg, children } as State<S> & { children?: readonly Node[] }
    return new WidgetNode(fn, state)
  }) as (...args: WidgetArgs<State<S>>) => WidgetNode<S, N>
}

export class WidgetNode<S extends object, C extends Node = Node> extends Node<S> {
  readonly #create: (props: S) => C
  #child?: C

  constructor(fn: (props: S) => C, props: State<S>) {
    super(props)
    this.#create = fn
  }

  override setup() {
    this.#child = this.#create(this.state) // runs ONCE; props is captured by closure
    this.add(this.#child) // adopt as real child so layout/parent ops work
  }

  get child(): C {
    if (this.#child === undefined) {
      throw new Error(
        "WidgetNode.child accessed before first render — body runs lazily in `_render`. " +
          "Call `await widget.render(ctx)` first if you need to inspect the inner tree."
      )
    }
    return this.#child
  }

  override layout(ctx: RenderCtx) {
    return this.child.getLayout(ctx)
  }

  async _render(ctx: RenderCtx): Promise<string[]> {
    return this.child.render(ctx)
  }
}
