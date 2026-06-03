import type { MaybePromise } from "@zaly/shared"
import type { Accessor, Ref } from "../core/reactive.ts"
import type { Matcher } from "./autocomplete.ts"
import type { Menu, MenuItem, MenuState } from "./menu.ts"

import { createAsync, memo, untrack } from "../core/reactive.ts"
import { fuzzyScore } from "./completions/fuzzy.ts"
import { Input } from "./input.ts"
import { menu } from "./menu.ts"
import { widget } from "./widget.ts"

export type PickerItem<T = string> = MenuItem<T> & { searchText?: string }

export type PickerResult<T extends PickerItem<unknown> = PickerItem> = {
  item: T
  score: number
}

export type PickerProps<T extends PickerItem<unknown> = PickerItem> = Omit<
  MenuState<T>,
  "items"
> & {
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

function isPickerResult<T extends PickerItem<unknown>>(
  x: T | PickerResult<T>
): x is PickerResult<T> {
  return typeof x === "object" && x !== null && "score" in x && "item" in x
}

function searchText(item: PickerItem<unknown>): string {
  const ret = item.searchText ?? item.label
  if (!ret) throw new Error("Picker items must have a label or searchText")
  return ret
}

export const picker = widget(
  <T extends PickerItem<unknown> = PickerItem>(props: PickerProps<T>) => {
    const input = () => (props.input instanceof Input ? props.input : props.input())
    const it = props.items
    // oxlint-disable-next-line prefer-const
    let m: Menu<T> | undefined

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

    return (m = menu<T>({ ...props, items }).bind(props.input))
  }
)
