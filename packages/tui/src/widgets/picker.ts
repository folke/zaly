import type { Reactive, Ref } from "../core/reactive.ts"
import type { State } from "../core/state.ts"
import type { SearchItem } from "../search/matcher.ts"
import type { SearchItems, SearchOptions } from "../search/search.ts"
import type { Option, Select, SelectState } from "./select.ts"
import type { TreeItem, TreeProps } from "./tree.ts"

import { sliceAnsi, stripAnsi } from "@zaly/shared/ansi"
import { createAsync, effect, memo, untrack, unwrap } from "../core/reactive.ts"
import { Searcher } from "../search/search.ts"
import { Input } from "./input.ts"
import { select } from "./select.ts"
import { tree } from "./tree.ts"
import { widget } from "./widget.ts"

export type PickerItem = Option & SearchItem
export type PickerActions = keyof ReturnType<typeof picker>["actions"]

type PickerBaseProps<T extends PickerItem = PickerItem> = SearchOptions<T> & {
  /** The `Input` to watch. Pass the node directly, or a `Ref<Input>`
   *  populated by `node.ref(ref)` elsewhere in the tree — the latter
   *  enables fully inline composition where the input doesn't need a
   *  local binding. The ref is dereferenced on mount, so wiring is
   *  type-safe and ordering-flexible (autocomplete can be constructed
   *  before the Input is). */
  input?: Input | Ref<Input>
  pattern?: Reactive<string>
  reverse?: boolean
}

export type PickerSelectProps<T extends PickerItem = PickerItem> = PickerBaseProps<T> &
  Omit<SelectState<T>, "items"> & {
    items: Reactive<SearchItems<T>>
    tree?: never
  }

export type PickerTreeProps<T extends TreeItem = TreeItem> = PickerBaseProps<T> &
  TreeProps<T> & {
    items?: never
  }

function isTree<T extends Option = Option>(
  props: PickerTreeProps<T> | PickerSelectProps<T>
): props is PickerTreeProps<T> {
  return "tree" in props
}

export const picker = widget(
  <T extends PickerItem = PickerItem>(props: State<PickerSelectProps<T> | PickerTreeProps<T>>) => {
    const pattern = memo(() => {
      if (props.pattern !== undefined) return unwrap(props.pattern)
      const inp = props.input instanceof Input ? props.input : props.input?.()
      return inp?.state.value ?? ""
    })

    let node: Select<T>
    let items: Reactive<SearchItems<T>>
    if (isTree(props)) {
      props = { filter: false, fuzzy: false, sort: false, ...props }
      node = tree(props)
      items = [...unwrap(node.state.items)]
    } else {
      node = select({ ...props, items: [] })
      items = props.items
    }
    const searcher = new Searcher<T>(props)

    node.extendRenderer((prev) => (item, ctx) => {
      let row = prev(item, ctx)
      if (!item.score) return row
      const stripped = stripAnsi(row)
      const positions = searcher.positions(stripped).toSorted((a, b) => b - a)
      while (positions.length > 0) {
        const from = positions.pop()!
        let to = from
        while (positions.length && positions.at(-1) === to + 1) to = positions.pop()!
        row =
          sliceAnsi(row, 0, from) +
          ctx.style.accent(stripped.slice(from, to + 1)) +
          sliceAnsi(row, to + 1)
      }
      return row
    })

    const results = createAsync(async () => searcher.search(unwrap(items), pattern()), {
      initialValue: [],
    })
    node.state.items = results
    if (props.input) node.bind(props.input)

    const matches = () =>
      unwrap(node.state.items)
        .map((item, i) => [item, i] as const)
        .filter(([item]) => item.score)
        .map(([, i]) => i)

    if (props.filter === false) {
      // When not filtering, go to the next match when the pattern changes
      effect(() => {
        const m = matches()
        if (m.length === 0 || pattern() === "") return
        untrack(() => {
          const active = node.active
          node.active = m.find((i) => i >= active) ?? m[0]
        })
      })
    }

    return node.withActions({
      "picker.next": () => {
        const active = node.active
        const m = matches()
        if (m.length === 0) return node.action("select.next")
        node.active = node.state.reverse
          ? (m.toReversed().find((i) => i < active) ?? m.at(-1)!)
          : (m.find((i) => i > active) ?? m[0])
      },
      "picker.prev": () => {
        const active = node.active
        const m = matches()
        if (m.length === 0) return node.action("select.prev")
        node.active = node.state.reverse
          ? (m.find((i) => i > active) ?? m[0])
          : (m.toReversed().find((i) => i < active) ?? m.at(-1)!)
      },
    })
  }
)
