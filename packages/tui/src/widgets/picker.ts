import type { MaybePromise } from "@zaly/shared"
import type { Accessor, Ref } from "../core/reactive.ts"
import type { Matcher } from "./autocomplete.ts"
import type { Select, Option, SelectState } from "./select.ts"

import { createAsync, memo, untrack } from "../core/reactive.ts"
import { fuzzyScore } from "./completions/fuzzy.ts"
import { Input } from "./input.ts"
import { select } from "./select.ts"
import { widget } from "./widget.ts"

export type PickerResult<T extends Option = Option> = {
  item: T
  score: number
}

export type PickerProps<T extends Option = Option> = Omit<SelectState<T>, "items"> & {
  /** The `Input` to watch. Pass the node directly, or a `Ref<Input>`
   *  populated by `node.ref(ref)` elsewhere in the tree — the latter
   *  enables fully inline composition where the input doesn't need a
   *  local binding. The ref is dereferenced on mount, so wiring is
   *  type-safe and ordering-flexible (autocomplete can be constructed
   *  before the Input is). */
  input: Input | Ref<Input>
  items: readonly T[] | ((query: string, match: Matcher) => MaybePromise<(T | PickerResult<T>)[]>)
  sort?: boolean
  /** If true (default), the picker will filter out items that don't match the query
   *  When false, all items are shown, but first result is selected */
  filter?: boolean
}

function isPickerResult<T extends Option = Option>(x: T | PickerResult<T>): x is PickerResult<T> {
  return "score" in x && "item" in x
}

function searchText(item: Option): string {
  const search: string[] = []
  if (item.search) search.push(item.search)
  else {
    if (typeof item.value === "string") search.push(item.value)
    if (item.name && item.name !== item.value) search.push(item.name)
  }
  if (search.length === 0) throw new Error("Picker items must have a label or searchText")
  return search.join(" ")
}

export const picker = widget(<T extends Option = Option>(props: PickerProps<T>) => {
  const input = () => (props.input instanceof Input ? props.input : props.input())
  const it = props.items
  // oxlint-disable-next-line prefer-const
  let m: Select<T> | undefined

  const results: Accessor<readonly PickerResult<T>[]> =
    typeof it === "function"
      ? createAsync(
          async (): Promise<PickerResult<T>[]> => {
            const query = input().state.value ?? ""
            const matcher: Matcher = (s) => fuzzyScore(query, s)
            const ret = await it(query, matcher)
            return ret.map((r) => (isPickerResult(r) ? r : { item: r, score: 1 }))
          },
          { initialValue: [] }
        )
      : memo(() => {
          const query = input().state.value ?? ""
          if (query === "") return it.map((item) => ({ item, score: 1 }))
          const matcher: Matcher = (s) => fuzzyScore(query, s)
          return it.map((item) => ({
            item,
            score: matcher(searchText(item)),
          }))
        })

  const items = memo(() => {
    let ret = results()
    if (props.sort) ret = ret.toSorted((a, b) => b.score - a.score)
    for (const r of ret) r.item.match = r.score > 0
    if (props.filter ?? true) ret = ret.filter(({ score }) => score > 0)
    else {
      let best = 0
      for (let i = 1; i < ret.length; i++) {
        if (ret[i].score > ret[best].score) best = i
      }
      untrack(() => {
        if (!m) return
        m.active = best
      })
    }
    return ret.map(({ item }) => item)
  })

  return (m = select<T>({ ...props, items }).bind(props.input))
})
