import type { MaybePromise } from "@zaly/shared"
import type { Accessor, Ref } from "../core/reactive.ts"
import type { Matcher } from "./autocomplete.ts"
import type { Option, Select, Selectable, SelectState } from "./select.ts"
import type { Tree, TreeNode, TreeProps } from "./tree.ts"

import { createAsync, effect, memo, untrack } from "../core/reactive.ts"
import { fuzzyScore } from "./completions/fuzzy.ts"
import { Input } from "./input.ts"
import { select } from "./select.ts"
import { tree } from "./tree.ts"
import { widget } from "./widget.ts"

export type PickerResult<T extends Option = Option> = {
  item: T
  score: number
}

export type PickerFn<T extends Option = Option> = (
  query: string,
  match: Matcher
) => MaybePromise<(T | PickerResult<T>)[]>

type PickerBaseProps = {
  /** The `Input` to watch. Pass the node directly, or a `Ref<Input>`
   *  populated by `node.ref(ref)` elsewhere in the tree — the latter
   *  enables fully inline composition where the input doesn't need a
   *  local binding. The ref is dereferenced on mount, so wiring is
   *  type-safe and ordering-flexible (autocomplete can be constructed
   *  before the Input is). */
  input: Input | Ref<Input>
  sort?: boolean
  /** If true (default), the picker will filter out items that don't match the query
   *  When false, all items are shown, but first result is selected */
  filter?: boolean
  fuzzy?: boolean
  reverse?: boolean
}

export type PickerSelectProps<T extends Option = Option> = PickerBaseProps &
  Omit<SelectState<T>, "items"> & {
    items: readonly T[] | PickerFn<T>
    tree?: never
  }

export type PickerTreeProps<T extends TreeNode = TreeNode> = PickerBaseProps &
  TreeProps<T> & {
    items?: never
    sort?: never
    filter?: never
  }

const smartSearch = (query: string): Matcher => {
  const hasCap = /[A-Z]/.test(query)
  if (!hasCap) query = query.toLowerCase()
  const parts = query.split(/\s+/).filter((p) => p !== "")
  return (s) => {
    if (query === "") return 1
    s = hasCap ? s : s.toLowerCase()
    return parts.every((p) => s.includes(p)) ? 1 : 0
  }
}

function isPickerResult<T extends Option = Option>(x: T | PickerResult<T>): x is PickerResult<T> {
  return "score" in x && "item" in x
}

function isTree<T extends Option = Option>(
  props: PickerTreeProps<T> | PickerSelectProps<T>
): props is PickerTreeProps<T> {
  return "tree" in props
}

function searchText(item: Option): string {
  const search: string[] = []
  if (item.search !== undefined) search.push(item.search)
  else {
    if (typeof item.value === "string") search.push(item.value)
    if (item.name !== undefined && item.name !== item.value) search.push(item.name)
  }
  if (search.length === 0) throw new Error("Picker items must have a label or searchText")
  return search.join(" ")
}

function pickerFn<T extends Option = Option>(props: PickerSelectProps<T>): Select<T>
function pickerFn<T extends TreeNode = TreeNode>(props: PickerTreeProps<T>): Tree<T>
function pickerFn<T extends Option = Option>(
  props: PickerSelectProps<T> | PickerTreeProps<T>
): Selectable<T>
function pickerFn<T extends Option = Option>(
  props: PickerSelectProps<T> | PickerTreeProps<T>
): Selectable<T> {
  const input = () => (props.input instanceof Input ? props.input : props.input())

  const matcher = memo(() => {
    const query = (input().state.value ?? "").trim()
    const ret: { query: string; match: Matcher } = {
      match: () => 1,
      query,
    }
    if (query !== "")
      ret.match = (props.fuzzy ?? true) ? (s: string) => fuzzyScore(query, s) : smartSearch(query)
    return ret
  })

  if (isTree(props)) {
    const t = tree({ ...props, tree: props.tree }).bind(props.input)
    effect(() => {
      const m = matcher()
      for (const item of t.items) {
        const s = m.match(searchText(item.value))
        item.value.match = s > 0
      }
      t.invalidate()
    })
    return t
  }

  const node = select<T>({ ...props, items: [] }).bind(props.input)
  const it = props.items

  const results: Accessor<readonly PickerResult<T>[]> =
    typeof it === "function"
      ? createAsync(
          async (): Promise<PickerResult<T>[]> => {
            const m = matcher()
            const ret = await it(m.query, m.match)
            return ret.map((r) => (isPickerResult(r) ? r : { item: r, score: 1 }))
          },
          { initialValue: [] }
        )
      : memo(() =>
          it.map((item) => ({
            item,
            score: matcher().match(searchText(item)),
          }))
        )

  const items = memo(() => {
    let ret = results()
    const query = (input().state.value ?? "").trim()
    if (props.sort && query !== "") {
      ret = ret.toSorted((a, b) => b.score - a.score)
      ret = props.reverse ? ret.toReversed() : ret
    }
    for (const r of ret) r.item.match = r.score > 0
    if (props.filter ?? true) ret = ret.filter(({ score }) => score > 0)
    else {
      let best = 0
      for (let i = 1; i < ret.length; i++) {
        if (ret[i].score > ret[best].score) best = i
      }
      untrack(() => {
        node.active = best
      })
    }
    return ret.map(({ item }) => item)
  })

  node.state.items = items

  return node
}

export const picker = widget(pickerFn)
