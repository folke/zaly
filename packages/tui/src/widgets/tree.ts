import type { Option, Select, SelectState } from "./select.ts"

import { select } from "./select.ts"

export type TreeItem<T extends Option = Option> = T & {
  children?: TreeItem<T>[]
  icon?: string
}

export type TreeProps<T extends TreeItem = TreeItem> = Omit<SelectState<T>, "items" | "active"> & {
  tree: T
  /** If true, the root node will be rendered and selectable. Defaults to false. */
  root?: boolean
  active?: T | ((item: T) => boolean)
}

const icons = {
  // last: "└─",
  last: "╰─",
  middle: "├─",
  vertical: "│ ",
}

export type TreeNode<T extends TreeItem> = {
  last?: boolean
  parent?: T
}

class Tree<T extends TreeItem> {
  nodes = new Map<T, TreeNode<T>>()
  items: T[] = []

  constructor(public root: T) {
    this.#build(root, undefined, true)
  }

  #build(item: T, parent?: T, last?: boolean) {
    this.nodes.set(item, { last, parent })
    this.items.push(item)
    const children = item.children ?? []
    for (let c = 0; c < children.length; c++) {
      const child = children[c] as T
      this.#build(child, item, c === children.length - 1)
    }
  }

  node(item: T) {
    return this.nodes.get(item)
  }
}

export function tree<T extends TreeItem>(props: TreeProps<T>): Select<T> {
  const t = new Tree(props.tree)
  const items = props.root === true ? t.items : t.items.slice(1)
  const activeFn = typeof props.active === "function" ? props.active : (i: T) => i === props.active
  const active = props.active ? items.findIndex((i) => activeFn(i)) : -1

  const ret = select({ ...props, active: active === -1 ? 0 : active, items })

  ret.extendRenderer((prev) => (item, ctx) => {
    const prefix: string[] = []
    const s = ctx.style
    const itemNode = t.node(item)
    let n = t.node(item)
    while (n?.parent) {
      if (props.root !== true && n.parent === props.tree) break
      let icon = ""
      if (n !== itemNode) icon = n.last ? "  " : icons.vertical
      else icon = n.last ? icons.last : icons.middle
      prefix.unshift(icon)
      n = t.node(n.parent)
    }
    const text = prev(item, ctx).replace(/\s+/g, " ")
    return `${s.gutter(prefix.join(""))}${text}`
  })

  return ret
}
