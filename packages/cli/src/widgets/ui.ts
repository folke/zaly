import type { Usage } from "@zaly/ai"
import type { Actions, Reactive } from "@zaly/tui"

import { actionsSource, autocomplete, box, filesSource, input, text } from "@zaly/tui"
import { statusline } from "./statusline.ts"

export interface UiState {
  busy: Reactive<boolean>
  model: Reactive<string>
  status: Reactive<string>
  usage: Reactive<Usage>
}

/**
 * Sticky footer tree: statusline, autocomplete popup, composer prompt.
 * Returned `input` is the composer node so `app.ts` can wire its
 * `submit` / `attach` handlers.
 */
export const appUi = (props: { state: UiState; actions: Actions }) =>
  box(
    { padding: [1, 0, 0, 0] },
    box(
      { flexDirection: "column", padding: [0, 1], style: "ui" },
      statusline(props.state),
      autocomplete({
        input: "composer",
        maxHeight: 8,
        sources: {
          file: filesSource(),
          slash: actionsSource({ actions: props.actions }),
        },
      }),
      box(
        { flexDirection: "row", gap: 1 },
        text(({ style }) => style.primary("❯"), { width: 1 }),
        input({ placeholder: "Ask zaly anything…" }).id("composer").focus()
      )
    )
  )
