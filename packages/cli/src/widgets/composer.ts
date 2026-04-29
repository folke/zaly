import { autocomplete, actionsSource, filesSource, input } from "@zaly/tui"
import type { Renderer } from "@zaly/tui"

/**
 * Composer = the input widget + its bound autocomplete popup. The
 * caller wires the `submit` event in app.ts.
 */
export function composer(renderer: Renderer): {
  input: ReturnType<typeof input>
  autocomplete: ReturnType<typeof autocomplete>
} {
  const inp = input({ placeholder: "Ask zaly anything…" }).id("composer").focus()
  const ac = autocomplete({
    input: "composer",
    maxHeight: 8,
    sources: {
      file: filesSource(),
      slash: actionsSource({ actions: renderer.actions }),
    },
  })
  return { autocomplete: ac, input: inp }
}
