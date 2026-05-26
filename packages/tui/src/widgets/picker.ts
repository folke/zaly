import type { Ref } from "../core/reactive.ts"
import type { Matcher } from "./autocomplete.ts"
import type { MenuItem, MenuState } from "./menu.ts"

import { createAsync, memo } from "../core/reactive.ts"
import { fuzzyScore } from "./completions/fuzzy.ts"
import { Input } from "./input.ts"
import { menu } from "./menu.ts"
import { widget } from "./widget.ts"

export type PickerItem<T = string> = MenuItem<T> & { searchText?: string }

export type PickerResult<T extends PickerItem<unknown> = PickerItem> =
  | readonly T[]
  | Promise<readonly T[]>

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
  items: readonly T[] | ((query: string, match: Matcher) => PickerResult<T>)
  sort?: boolean
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

    const items =
      typeof it === "function"
        ? createAsync(
            async (): Promise<T[]> => {
              const query = input().state.value ?? ""
              const matcher: Matcher = (s) => fuzzyScore(query, s)
              const ret = await it(query, matcher)
              return [...ret]
            },
            { initialValue: [] }
          )
        : memo(() => {
            const query = input().state.value ?? ""
            if (query === "") return it
            const matcher: Matcher = (s) => fuzzyScore(query, s)
            const scores = it.map((item) => ({ item, score: matcher(searchText(item)) }))
            if (props.sort) scores.sort((a, b) => b.score - a.score)
            return scores.filter(({ score }) => score > 0).map(({ item }) => item)
          })

    return menu<T>({ ...props, items }).bind(props.input)
  }
)
