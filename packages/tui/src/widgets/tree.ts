import type { RenderCtx } from "../core/ctx.ts"
import type { Ref } from "../core/reactive.ts"
import type { NodeActionMap } from "../input/actions.ts"
import type {
  Option,
  OptionRender,
  OptionRenderCtx,
  Selectable,
  SelectEvents,
  SelectState,
} from "./select.ts"

import { Node } from "../core/node.ts"
import { Select } from "./select.ts"

export type TreeNode<T extends Option = Option> = T & {
  children?: TreeNode<T>[]
  icon?: string
}

export type TreeProps<T extends TreeNode = TreeNode> = Omit<SelectState<T>, "items" | "active"> & {
  tree: T
  /** If true, the root node will be rendered and selectable. Defaults to false. */
  root?: boolean
  active?: T | ((item: T) => boolean)
}

export type TreeEvents<T extends TreeNode = TreeNode> = SelectEvents<T> & {}

const icons = {
  // last: "└─",
  last: "╰─",
  middle: "├─",
  vertical: "│ ",
}

export type TreeItem<T extends TreeNode = TreeNode> = Option & {
  node: T
  last?: boolean
  parent?: TreeItem<T>
}

export class Tree<T extends TreeNode = TreeNode>
  extends Node<TreeProps<T>, TreeEvents<T>>
  implements Selectable<T>
{
  static readonly type = "tree"
  override readonly type = Tree.type
  select: Select<TreeItem<T>>
  #optionRender: OptionRender<T>
  readonly items: readonly TreeItem<T>[] = []
  readonly nodes: readonly T[] = []

  override actions = {} satisfies NodeActionMap

  constructor(props: TreeProps<T>) {
    super(props)
    this.items = this.#build()
    const activeFn =
      typeof props.active === "function" ? props.active : (i: T) => i === props.active
    const active = props.active ? this.items.findIndex((i) => activeFn(i.node)) : -1
    this.nodes = this.items.map((i) => i.node)
    this.select = new Select({
      ...this.state,
      active: active === -1 ? 0 : active,
      items: this.items,
      render: this.#render.bind(this),
    })
    this.#optionRender = this.state.render ?? (this.select.defaultRenderer() as OptionRender<T>)
    this.add(this.select)
    this.select
      .on("complete", ({ item }) => this.emit("complete", { item: item.node }))
      .on("accept", ({ item }) => this.emit("accept", { item: item.node }))
      .on("cancel", () => this.emit("cancel"))
  }

  #render(item: TreeItem<T>, _active: boolean, ctx: OptionRenderCtx<TreeItem<T>>): string {
    const visible = ctx.visible.map((i) => i.node)
    const prefix: string[] = []
    const s = ctx.style
    let n = item as TreeItem<T> | undefined
    while (n?.parent) {
      let icon = ""
      if (n !== item) {
        icon = n.last ? "  " : icons.vertical
      } else {
        icon = n.last ? icons.last : icons.middle
      }
      prefix.unshift(icon)
      n = n.parent
    }
    const text = this.#optionRender(item.node, _active, { ...ctx, visible }).replace(/\s+/g, " ")
    return `${s.gutter(prefix.join(""))}${text}`
  }

  #build(
    item = this.state.tree,
    opts: { parent?: TreeItem<T>; last?: boolean; tree?: TreeItem<T>[] } = {}
  ): TreeItem<T>[] {
    const ret = opts.tree ?? []
    const it: TreeItem<T> | undefined =
      item === this.state.tree && !this.state.root
        ? undefined
        : { last: opts.last, node: item, parent: opts.parent, text: item.text }
    if (it) ret.push(it)
    const children = item.children ?? []
    for (let c = 0; c < children.length; c++) {
      const child = children[c] as T
      this.#build(child, { last: c === children.length - 1, parent: it, tree: ret })
    }
    return ret
  }

  protected _render(ctx: RenderCtx): string[] | Promise<string[]> {
    // Menu does all the layout. We're just a wrapper node so callers
    // can place the popup in their tree and so the `visible` toggle
    // flows through one handle.
    return this.select.render(ctx)
  }

  bind(node: Node | Ref<Node>): this {
    this.select.bind(node)
    return this
  }
}

export function tree<T extends TreeNode>(props: TreeProps<T>): Tree<T> {
  return new Tree(props)
}
