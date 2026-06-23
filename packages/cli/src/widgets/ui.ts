import type { Accessor, Actions, Ref } from "@zaly/tui"
import type { Input } from "@zaly/tui/widgets/input"
import type { App } from "../app/app.ts"
import type { Composer } from "../app/composer.ts"

import { extractFileUsage } from "@zaly/agent"
import { memo } from "@zaly/tui"
import { autocomplete } from "@zaly/tui/widgets/autocomplete"
import { box } from "@zaly/tui/widgets/box"
import { actionsSource, filesSource } from "@zaly/tui/widgets/completions"
import { divider } from "@zaly/tui/widgets/divider"
import { overlay } from "@zaly/tui/widgets/overlay"
import { text } from "@zaly/tui/widgets/text"
import { resolve } from "pathe"
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
  app: App
  composer: Ref<Input>
  actions: Actions
  enabled: Accessor<boolean>
}) => {
  const ac = autocomplete({
    enabled: props.enabled,
    frecency: () => {
      if (!props.app.ready) return () => 0
      const usage = extractFileUsage(props.app.agent.messages)
      const scores = new Map<string, number>()
      for (const u of usage) scores.set(u.path, u.score)
      return (file: string) => scores.get(resolve(file)) ?? 0
    },
    input: props.composer,
    maxHeight: memo(() => props.app.$.ui.listHeight),
    reverse: true,
    sortEmpty: true,
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
