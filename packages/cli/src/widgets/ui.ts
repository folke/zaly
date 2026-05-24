import type { Accessor, Actions, Input, Menu, PickerItem, PickerOptions, Ref } from "@zaly/tui"
import type { App } from "../app/app.ts"

import {
  actionsSource,
  autocomplete,
  box,
  divider,
  filesSource,
  memo,
  overlay,
  picker,
  show,
  text,
} from "@zaly/tui"
import { createComposer } from "../app/composer.ts"
import { statusline } from "./statusline.ts"

/**
 * Sticky footer tree: statusline, autocomplete popup, composer prompt.
 * Returned `input` is the composer node so `app.ts` can wire its
 * `submit` / `attach` handlers.
 */
export const appUi = ({ app, composer }: { app: App; composer: Ref<Input> }) =>
  box(
    { padding: [1, 0, 0, 0] },
    box(
      { flexDirection: "column", padding: [0, 1], style: "ui" },
      divider(),
      box(
        { flexDirection: "row", gap: 1 },
        text(({ style }) => style.primary("❯"), { width: 1 }),
        createComposer({ app }).ref(composer).focus()
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

export type PickOpts<T extends PickerItem<unknown> = PickerItem> = PickerOptions<T> & {
  title?: string
  ref?: Ref<Menu<T>>
}

export function pickerOverlay<T extends PickerItem<unknown> = PickerItem>(opts: PickOpts<T>) {
  return overlay(
    {
      padding: [0, 1],
      relative: "ui",
      style: "ui",
      verticalAnchor: "bottom",
      x: 0,
      y: 1,
    },
    divider({ style: "accent" }),
    show(
      { when: !!opts.title },
      text(opts.title!, { style: "borderTitle" }),
      divider({ style: "border" })
    ),
    picker<T>({ ...opts, maxHeight: 8 }).ref(opts.ref)
  )
}
