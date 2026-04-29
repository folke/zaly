import type { Reactive, Renderer } from "@zaly/tui"

import { box, text } from "@zaly/tui"
import { composer } from "../widgets/composer.ts"
import { statusline } from "../widgets/statusline.ts"

export interface UiState {
  busy: Reactive<boolean>
  model: Reactive<string>
  status: Reactive<string>
}

/**
 * Build the sticky footer tree. Owns: statusline, hints, autocomplete,
 * composer. Returned `input` is the composer node so app.ts can wire
 * its `submit` handler.
 */
export function buildUi(
  renderer: Renderer,
  state: UiState
): { input: ReturnType<typeof composer>["input"] } {
  const c = composer(renderer)

  renderer.ui.add(
    box(
      { padding: [1, 0, 0, 0] },
      box(
        { bg: "bg", flexDirection: "column", padding: [0, 1] },
        statusline(state),
        // text(({ style }) =>
        //   style.dim("/ commands · @ files · ctrl-h help · ctrl-x stop · ctrl-c quit")
        // ),
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
