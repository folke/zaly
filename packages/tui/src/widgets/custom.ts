import type { RenderCtx } from "../core/ctx.ts"
import type { TypedEmitter } from "../core/emitter.ts"
import type { BaseEvents } from "../core/node.ts"

import { isNode, Node } from "../core/node.ts"
import { stackColumn } from "../layout/column.ts"

type Child = Node | false | null | undefined

export type NodeRenderFn<S extends object, E extends BaseEvents> = (args: {
  state: S
  ctx: RenderCtx
  emit: TypedEmitter<E>["emit"]
}) => Node | Child[]

/**
 * Create a custom node from initial state and a render function. The common
 * case is to return a single composed Node (a box subtree). Returning an
 * array stacks the children vertically at ctx width — useful when there's
 * no styling/chrome to apply via a Box.
 *
 * ```ts
 * const toolCall = node(
 *   { name: "", status: "running" },
 *   ({ state }) => box({ border: "rounded" }, text(state.name)),
 * )
 * ```
 */
export function node<S extends object, E extends BaseEvents = BaseEvents>(
  initialState: S,
  render: NodeRenderFn<S, E>
): Node<S, E> {
  return new CustomNode<S, E>(initialState, render)
}

class CustomNode<S extends object, E extends BaseEvents> extends Node<S, E> {
  readonly #renderFn: NodeRenderFn<S, E>

  constructor(initialState: S, renderFn: NodeRenderFn<S, E>) {
    super(initialState)
    this.#renderFn = renderFn
  }

  protected async _render(ctx: RenderCtx): Promise<string[]> {
    const emit = this.emit.bind(this)
    const result = this.#renderFn({ ctx, emit, state: this.state })
    if (isNode(result)) {
      return result.render(ctx)
    }
    const kids = result.filter((c): c is Node => Boolean(c))
    const childRows = await Promise.all(kids.map((c) => c.render(ctx)))
    return stackColumn(childRows, { gap: 0, width: ctx.width })
  }
}
