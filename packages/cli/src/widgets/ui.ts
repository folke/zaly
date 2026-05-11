import type { Usage } from "@zaly/ai"
import type { Reactive, Renderer } from "@zaly/tui"

import { box, text } from "@zaly/tui"
import { composer } from "./composer.ts"
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
export function appUi(
  renderer: Renderer,
  state: UiState
): { input: ReturnType<typeof composer>["input"] } {
  const c = composer(renderer)

  renderer.ui.add(
    box(
      { padding: [1, 0, 0, 0] },
      box(
        { flexDirection: "column", padding: [0, 1], style: "ui" },
        statusline(state),
        c.autocomplete,
        box(
          { flexDirection: "row", gap: 1 },
          text(({ style }) => style.primary("❯"), { width: 1 }),
          c.input
        )
      )
    )
  )

  return { input: c.input }
}
