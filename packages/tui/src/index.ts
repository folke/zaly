import type { RenderCtx } from "./core/ctx.ts"
import type { TypedEmitter } from "./core/emitter.ts"
import type { Node } from "./core/node.ts"
import type { BaseEvents } from "./core/types.ts"
import type { BoxStyle } from "./nodes/box.ts"
import type { TextStyle } from "./nodes/text.ts"

import { isNode, NodeBase } from "./core/node.ts"
import { stackColumn } from "./layout/column.ts"
import { Box } from "./nodes/box.ts"
import { Text } from "./nodes/text.ts"

export type { Events, TypedEmitter } from "./core/emitter.ts"
export type { BaseEvents, Color, Pct, Size, Style } from "./core/types.ts"
export type { BorderSpec } from "./layout/border.ts"
export type { BoxEvents, BoxStyle, Padding } from "./nodes/box.ts"
export type { TextStyle } from "./nodes/text.ts"
export type { Theme } from "./core/ctx.ts"
export { Emitter } from "./core/emitter.ts"
export { isNode, NodeBase } from "./core/node.ts"
export { borders, drawBorder, resolveBorder } from "./layout/border.ts"
export { Box } from "./nodes/box.ts"
export { Text } from "./nodes/text.ts"
export { openStyle, RESET } from "./style/ansi.ts"
export { ansi } from "./themes/ansi.ts"
export { tokyoNightMoon } from "./themes/tokyonight-moon.ts"

type Child = Node | false | null | undefined

export function text(content: string, style?: Omit<TextStyle, "content">): Text
export function text(style: TextStyle): Text
export function text(first: string | TextStyle, style?: Omit<TextStyle, "content">): Text {
  if (typeof first === "string") return new Text({ content: first, ...style })
  return new Text(first)
}

export function box(style: BoxStyle, ...children: Child[]): Box
export function box(...children: Child[]): Box
export function box(first?: BoxStyle | Child, ...rest: Child[]): Box {
  let style: BoxStyle
  let children: Child[]
  if (
    first !== undefined &&
    first !== null &&
    first !== false &&
    typeof first === "object" &&
    !isNode(first)
  ) {
    style = first
    children = rest
  } else {
    style = {}
    children = first === undefined ? rest : [first, ...rest]
  }
  const b = new Box(style)
  for (const c of children) if (c) b.add(c)
  return b
}

export type NodeRenderFn<S extends object, E extends BaseEvents> = (args: {
  state: S
  ctx: RenderCtx
  emit: TypedEmitter<E>["emit"]
}) => Node | Child[]

export function node<S extends object, E extends BaseEvents = BaseEvents>(
  initialState: S,
  render: NodeRenderFn<S, E>
): Node<S, E> {
  return new CustomNode<S, E>(initialState, render)
}

class CustomNode<S extends object, E extends BaseEvents> extends NodeBase<S, E> {
  readonly #renderFn: NodeRenderFn<S, E>

  constructor(initialState: S, renderFn: NodeRenderFn<S, E>) {
    super(initialState)
    this.#renderFn = renderFn
  }

  protected _render(ctx: RenderCtx): string[] {
    const emit = this.emit.bind(this)
    const result = this.#renderFn({ ctx, emit, state: this.state })
    if (isNode(result)) {
      result.parent = this
      return result.render(ctx)
    }
    const kids = result.filter((c): c is Node => Boolean(c))
    for (const c of kids) c.parent = this
    const childRows = kids.map((c) => c.render(ctx))
    return stackColumn(childRows, { gap: 0, width: ctx.width })
  }
}
