import type { Accessor, Actions, Ref } from "@zaly/tui"
import type { Input } from "@zaly/tui/widgets/input"
import type { App } from "../app/app.ts"
import type { Composer } from "../app/composer.ts"

import { memo } from "@zaly/tui"
import { autocomplete } from "@zaly/tui/widgets/autocomplete"
import { box } from "@zaly/tui/widgets/box"
import { actionsSource, filesSource } from "@zaly/tui/widgets/completions"
import { divider } from "@zaly/tui/widgets/divider"
import { overlay } from "@zaly/tui/widgets/overlay"
import { text } from "@zaly/tui/widgets/text"
import { statusline } from "./statusline.ts"

/**
 * Sticky footer tree: statusline, autocomplete popup, composer prompt.
 * Returned `input` is the composer node so `app.ts` can wire its
 * `submit` / `attach` handlers.
 */
export const appUi = ({ app, composer }: { app: App; composer: Composer }) =>
  box(
    { padding: [1, 0, 0, 0] },
    box(
      { flexDirection: "column", padding: [0, 1], style: "ui" },
      divider(),
      box(
        { flexDirection: "row", gap: 1 },
        text(({ style }) => style.primary("❯"), { width: 1 }),
        composer.ui.focus()
      ),
      divider(),
      statusline(app.state)
    )
  )

export const autocompleteOverlay = (props: {
  composer: Ref<Input>
  actions: Actions
  enabled: Accessor<boolean>
}) => {
  const ac = autocomplete({
    enabled: props.enabled,
    input: props.composer,
    maxHeight: 8,
    sources: {
      file: filesSource(),
      slash: actionsSource({ actions: props.actions }),
    },
  })
  const visible = memo(() => ac.visible)
  return overlay(
    {
      padding: [0, 1],
      relative: "ui",
      style: "ui",
      verticalAnchor: "bottom",
      visible,
      x: 0,
      y: 1,
    },
    divider({ style: "accent" }),
    ac
  )
}
