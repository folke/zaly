import type { Config } from "@zaly/config"
import type { MaybePromise } from "@zaly/shared"
import type { PropPath, PropValue } from "@zaly/shared/prop"
import type { PickerItem } from "@zaly/tui/widgets/picker"
import type { OptionRenderCtx, Select } from "@zaly/tui/widgets/select"
import type { App } from "./app.ts"

import { defaultSettings } from "@zaly/config"
import { propGet } from "@zaly/shared/prop"
import { createRef, inspect } from "@zaly/tui"
import { isDeepStrictEqual as is } from "node:util"
import { REASONING_EFFORTS } from "../context.ts"

type ConfigProp<T = unknown> = PropPath<Config, T>
type ConfigValue<T extends ConfigProp> = PropValue<Config, T>
type ConfigItem<T extends ConfigProp = ConfigProp, V = NonNullable<ConfigValue<T>>> = PickerItem & {
  name: string
  prop: T
  value?: V
  default?: V
  initial?: V
  desc?: string
  options?: readonly V[]
  toggle: () => MaybePromise
}
type OptionOpts<T extends ConfigProp> = Partial<ConfigItem<T>> &
  Pick<ConfigItem<T>, "name" | "prop"> &
  (Pick<ConfigItem<T>, "options"> | Pick<ConfigItem<T>, "toggle">)
type ToggleOpts<T extends ConfigProp<boolean>> = Omit<OptionOpts<T>, "options" | "toggle">

function render(item: ConfigItem, ctx: OptionRenderCtx<ConfigItem>): string {
  const s = ctx.style
  const v = item.value
  const isDefault = is(v, item.default)
  const name = s.add({
    bold: !isDefault,
    dim: isDefault && !ctx.active,
  })(item.name.padEnd(20))
  let value: string
  if (v === undefined) value = s.muted("unset")
  else if (typeof v === "boolean") value = v ? s.mdListChecked("[x]") : s.mdListUnchecked("[ ]")
  else value = inspect(v, { style: s })
  return `${name} ${value}`
}

export async function editConfig(app: App, opts: { scope?: "user" | "project" } = {}) {
  const scope = opts.scope ?? "user"
  const config = app.config[scope]

  function option<T extends ConfigProp>(item: OptionOpts<T>): ConfigItem<T> {
    const def = propGet(defaultSettings as Config, item.prop) as ConfigValue<T>
    if (def !== undefined && item.options && !item.options.find((o) => is(o, def)))
      throw new Error(`Default value ${inspect(def)} not in options for ${inspect(item.prop)}`)
    let value = config.propGet(item.prop) ?? def
    const options = item.options

    let t = item.toggle
    t ??= options
      ? () => {
          let idx = value === undefined ? -1 : options.findIndex((o) => is(o, value))
          idx = idx === -1 ? 0 : (idx + 1) % options.length
          value = options[idx]
        }
      : undefined
    if (!t) throw new Error(`Options must be provided for ${inspect(item.prop)}`)

    return {
      text: item.name,
      ...item,
      get default() {
        return def
      },
      initial: value,
      toggle: t,
      get value(): ConfigValue<T> | undefined {
        return value
      },
      set value(v: ConfigValue<T>) {
        value = v
      },
    }
  }

  function toggle<T extends ConfigProp<boolean>>(item: ToggleOpts<T>): ConfigItem<T, boolean> {
    return option<T>({ ...item, options: [true, false] } as unknown as OptionOpts<T>)
  }

  const items: ConfigItem[] = [
    option({
      name: "Reasoning Effort",
      options: REASONING_EFFORTS,
      prop: ["reasoning"],
    }),
    option({
      name: "Theme",
      prop: ["ui", "theme"],
      async toggle() {
        const { pickTheme } = await import("./themes.ts")
        const theme = await pickTheme(app)
        if (theme) this.value = theme
      },
    }),
    toggle({
      name: "Show Reasoning",
      prop: ["ui", "reasoning"],
    }),
    toggle({
      name: "Show Images",
      prop: ["ui", "images"],
    }),
    option({
      name: "List Height",
      options: [10, 20, 30, 40],
      prop: ["ui", "listHeight"],
    }),
    option({
      name: "Tree Height",
      options: [10, 20, 30, 40],
      prop: ["ui", "treeHeight"],
    }),
    toggle({
      name: "Auto Compaction",
      prop: ["compaction", "enabled"],
    }),
    option({
      name: "Permissions Preset",
      options: ["strict", "readonly", "permissive", "yolo"],
      prop: ["permissions", "preset"],
    }),
  ]

  const ref = createRef<Select<ConfigItem>>()
  const action = app.actions.get("config.toggle")
  const keys = (action?.keys ?? ["space", "enter"]).map((k) => `\`<${k}>\``).join(" / ")
  await app.pick({
    actions: {
      "config.toggle": {
        desc: "Toggle a config option",
        fn: () => {
          const select = ref()
          const active = select.item
          if (!active) return
          void (async () => {
            await active.toggle()
            select.invalidate()
          })()
        },
        keys: ["space", "enter"],
        priority: 10,
      },
    },
    details: `Use ${keys} to toggle a config option. Press \`<esc>\` to close.`,
    items,
    maxHeight: app.$.ui.listHeight,
    ref,
    render,
    title: `Edit ${scope} config`,
  })

  let changed = false
  for (const item of items) {
    if (is(item.value, item.initial)) continue
    // oxlint-disable-next-line no-await-in-loop
    await config.propSet(item.prop, is(item.value, item.default) ? undefined : item.value)
    changed = true
  }
  if (!changed) return
  app.notify(`Updated ${scope} config.`, { level: "success" })
  await app.reload()
}
