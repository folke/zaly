import type { Node } from "../core/node.ts"

import { createNode } from "../core/reactive.ts"

export type Props = Record<string, any>

/** A widget is a `(props) → Node` factory. Same shape as `box`/`text`
 *  themselves — props in, Node out, runs once at construction.
 *
 *  The props argument is optional when every field of `P` is optional
 *  (or `P` is `{}` outright), so `noPropsWidget()` doesn't force a
 *  `noPropsWidget({})` call site. The `{} extends P` check is the
 *  canonical TS idiom for "P has no required fields". */
export type Widget<
  P extends Props = {},
  N extends Node = Node,
  C extends Node = never,
> = {} extends P ? (props?: P, ...children: C[]) => N : (props: P, ...children: C[]) => N

export type WidgetFactory<S extends Props = {}, N extends Node = Node, C extends Node = never> = (
  fn: Widget<S, N, C>
) => Widget<S, N, C>

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

export function widget<S extends Props, N extends Node = Node, C extends Node = never>(
  fn: Widget<S, N, C>
): Widget<S, N, C> {
  return ((props?: S, ...children: C[]) => createNode(() => fn(props as S, ...children))) as Widget<
    S,
    N,
    C
  >
}
