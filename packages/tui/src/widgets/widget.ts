import type { Node } from "../core/node.ts"

import { createNode } from "../core/reactive.ts"

export type Props = Record<string, unknown>

/**
 * A widget factory: takes some args, returns a `Node`.
 *
 * The default `A = never[]` makes the *bare* `Widget` the universal
 * "any widget" type — the `(...args: never[]) => Node` idiom. Every
 * concrete factory (zero-arg, `state + ...children`, single-props) is
 * assignable to it, so it works both as the `widget()` constraint and
 * as a stored value type (`details?: Widget`, invoked zero-arg). Supply
 * `A` explicitly for a precise signature: `Widget<[State<LogState>]>`.
 */
export type Widget<A extends unknown[] = never[], N extends Node = Node> = (...args: A) => N

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

export function widget<T extends Widget>(fn: T): T {
  return ((...args: Parameters<T>) => createNode(() => fn(...args))) as T
}
