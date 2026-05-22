import type { Reactive, Ref } from "../core/reactive.ts"
import type { CompleteResult, Matcher } from "./autocomplete.ts"
import type { MenuItem, MenuState } from "./menu.ts"

import { createAsync, unwrap } from "../core/reactive.ts"
import { fuzzyScore } from "./completions/fuzzy.ts"
import { Input } from "./input.ts"
import { menu } from "./menu.ts"
import { widget } from "./widget.ts"

export type PickerOptions<T = MenuItem> = Omit<MenuState<T>, "items"> & {
  /** The `Input` to watch. Pass the node directly, or a `Ref<Input>`
   *  populated by `node.ref(ref)` elsewhere in the tree — the latter
   *  enables fully inline composition where the input doesn't need a
   *  local binding. The ref is dereferenced on mount, so wiring is
   *  type-safe and ordering-flexible (autocomplete can be constructed
   *  before the Input is). */
  input: Input | Ref<Input>
  items: Reactive<T[]> | ((query: string, match: Matcher) => CompleteResult<T>)
}

export const picker = widget(<T extends MenuItem = MenuItem>(props: PickerOptions<T>) => {
  const input = () => (props.input instanceof Input ? props.input : props.input())

  const items = createAsync(
    async (): Promise<T[]> => {
      const query = input().state.value ?? ""
      const it = unwrap(props.items)
      if (Array.isArray(it)) return it
      const matcher: Matcher = (s) => fuzzyScore(query, s)
      return it(query, matcher)
    },
    { initialValue: [] }
  )
  return menu<T>({ ...props, items }).bind(props.input)
})
