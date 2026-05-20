import type { Usage } from "@zaly/ai"
import type { Actions, Input, Reactive, Ref } from "@zaly/tui"

import {
  actionsSource,
  autocomplete,
  box,
  divider,
  filesSource,
  input,
  memo,
  overlay,
  text,
} from "@zaly/tui"
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
export const appUi = (props: { state: UiState; actions: Actions; composer: Ref<Input> }) =>
  box(
    { padding: [1, 0, 0, 0] },
    box(
      { flexDirection: "column", padding: [0, 1], style: "ui" },
      // autocomplete({
      //   input: props.composer,
      //   maxHeight: 8,
      //   sources: {
      //     file: filesSource(),
      //     slash: actionsSource({ actions: props.actions }),
      //   },
      // }),
      divider(),
      box(
        { flexDirection: "row", gap: 1 },
        text(({ style }) => style.primary("❯"), { width: 1 }),
        input({ placeholder: "Ask zaly anything…" }).ref(props.composer).focus()
      ),
      divider(),
      statusline(props.state)
    )
  )

export const autocompleteOverlay = (props: { composer: Ref<Input>; actions: Actions }) => {
  const ac = autocomplete({
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
      style: "ui",
      verticalAnchor: "bottom",
      visible,
      x: 0,
      y: -4,
    },
    divider({ style: "accent" }),
    ac
  )
}
