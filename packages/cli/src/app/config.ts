import type { Config, ResolvedConfig } from "@zaly/config"
import type { MaybePromise } from "@zaly/shared"
import type { PropPath, PropValue } from "@zaly/shared/prop"
import type { ToggleItem } from "@zaly/tui/services/picker"
import type { PickerItem } from "@zaly/tui/widgets/picker"
import type { OptionRenderCtx, Select } from "@zaly/tui/widgets/select"
import type { App } from "./app.ts"

import { toolRegistry } from "@zaly/agent"
import { defaultSettings } from "@zaly/config"
import { fitAnsi, stringWidth } from "@zaly/shared/ansi"
import { propGet } from "@zaly/shared/prop"
import { createRef, inspect } from "@zaly/tui"
import { isDeepStrictEqual as is } from "node:util"
import { REASONING_EFFORTS } from "../context.ts"

type ConfigProp<T = unknown> = PropPath<Config, T>
type ConfigValue<T extends ConfigProp> = PropValue<Config, T>
type ConfigItem<T extends ConfigProp = ConfigProp, V = ConfigValue<T>> = PickerItem & {
  name: string
  prop: T
  value?: V
  default?: V
  initial?: V
  desc: string
  options?: readonly V[]
  toggle: () => MaybePromise
}
type OptionOpts<T extends ConfigProp> = Partial<ConfigItem<T>> &
  Pick<ConfigItem<T>, "name" | "prop" | "desc"> &
  (Pick<ConfigItem<T>, "options"> | Pick<ConfigItem<T>, "toggle">)
type ToggleOpts<T extends ConfigProp<boolean>> = Omit<OptionOpts<T>, "options" | "toggle">

type SessionTreeSection = ResolvedConfig["ui"]["sessionTree"][number]

function renderItem(item: ConfigItem, ctx: OptionRenderCtx<ConfigItem>): [string, string] {
  const s = ctx.style
  const v = item.value
  const isDefault = is(v, item.default)
  const label = s.add({
    bold: !isDefault,
    dim: isDefault && !ctx.active,
  })(item.name)
  let value: string
  if (v === undefined) value = s.muted("unset")
  else if (typeof v === "boolean") value = v ? s.mdListChecked("[x]") : s.mdListUnchecked("[ ]")
  else value = inspect(v, { indent: 0, style: s })
  return [label, value]
}

function renderer() {
  let items: readonly ConfigItem[] = []
  let labelWidth = 0
  let valueWidth = 0

  const update = (ctx: OptionRenderCtx<ConfigItem>) => {
    if (ctx.items === items) return
    items = ctx.items
    const rendered = items.map((item) => renderItem(item, ctx))
    labelWidth = rendered.reduce((max, [label]) => Math.max(max, stringWidth(label)), 0)
    valueWidth = Math.min(
      50,
      rendered.reduce((max, [, value]) => Math.max(max, stringWidth(value)), 0)
    )
  }

  return (item: ConfigItem, ctx: OptionRenderCtx<ConfigItem>): string => {
    update(ctx)
    const s = ctx.style
    const [label, value] = renderItem(item, ctx)
    const labelStr = fitAnsi(label, labelWidth)
    const valueStr = fitAnsi(value, valueWidth)
    return `${labelStr}    ${valueStr}    ${item.desc ? s.muted(item.desc) : ""}`
  }
}

export async function pickTools(tools: string[] | undefined, app: App): Promise<string[]> {
  const items: ToggleItem[] = []
  const all = await Promise.all(toolRegistry.keys().map((t) => toolRegistry.load(t)))
  const used = tools ?? defaultSettings.tools
  const seen = new Set<string>()
  for (const tool of all) {
    const enabled = used.includes(tool.name)
    if (enabled) seen.add(tool.name)
    items.push({
      desc: tool.desc,
      enabled,
      name: tool.name,
      text: tool.name,
    })
  }
  for (const name of used) {
    if (seen.has(name)) continue
    items.unshift({
      desc: "Unknown tool. Has the plugin that provided this tool been removed?",
      enabled: true,
      name,
      text: name,
    })
  }
  await app.pick({
    details: "Toggle tools to enable or disable them.",
    items,
    maxHeight: app.$.ui.listHeight,
    multi: true,
    title: "Pick Tools",
  })
  const enabled: string[] = []
  for (const item of items) if (item.enabled && item.name) enabled.push(item.name)
  return enabled
}

export async function pickSessionTree(
  value: undefined | SessionTreeSection[],
  app: App
): Promise<SessionTreeSection[]> {
  const enabled: SessionTreeSection[] = value ?? defaultSettings.ui.sessionTree
  const all: ResolvedConfig["ui"]["sessionTree"] = ["assistant", "reasoning", "tools", "system"]
  const items: ToggleItem[] = all.map((name) => ({
    desc: `Show ${name} in the session tree`,
    enabled: enabled.includes(name),
    name,
    text: name,
  }))
  await app.pick({
    details: "Toggle tools to enable or disable them.",
    items,
    maxHeight: app.$.ui.listHeight,
    multi: true,
    title: "Pick Tools",
  })
  return items
    .filter((item) => item.enabled && item.name)
    .map((item) => item.name as SessionTreeSection)
}

export async function editConfig(app: App, opts: { scope?: "user" | "project" } = {}) {
  const scope = opts.scope ?? "user"
  const config = app.config[scope]

  function option<T extends ConfigProp>(item: OptionOpts<T>): ConfigItem<T> {
    const def = propGet(defaultSettings as Config, item.prop) as ConfigValue<T>
    if (def !== undefined && item.options && item.options.find((o) => is(o, def)) === undefined)
      throw new Error(
        `Default value ${inspect(def)} not in options for ${inspect(item.prop)}\n${inspect(item.options)}`
      )
    let value = config.get(item.prop) ?? def
    const options = item.options

    let t = item.toggle
    t ??= options
      ? () => {
          const idx = value === undefined ? -1 : options.findIndex((o) => is(o, value))
          value = options[(idx + 1) % options.length]
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
      desc: "Default reasoning effort",
      name: "Reasoning Effort",
      options: REASONING_EFFORTS,
      prop: ["reasoning"],
    }),
    option({
      desc: "Default model to use for the agent",
      name: "Model",
      prop: ["model"],
      async toggle() {
        const { pickModel } = await import("./model.ts")
        const model = await pickModel(app)
        if (model) this.value = model.id
      },
    }),
    option({
      desc: "Enabled tools for the agent",
      name: "Tools",
      prop: ["tools"],
      async toggle() {
        this.value = await pickTools(this.value, app)
      },
    }),
    option({
      desc: "Color theme for the UI",
      name: "Theme",
      prop: ["ui", "theme"],
      async toggle() {
        const { pickTheme } = await import("./themes.ts")
        const theme = await pickTheme(app)
        if (theme) this.value = theme
      },
    }),
    toggle({
      desc: "Show agent reasoning traces in the UI",
      name: "Show Reasoning",
      prop: ["ui", "reasoning"],
    }),
    option({
      desc: "Visible sections in the session tree",
      name: "Session Tree",
      prop: ["ui", "sessionTree"],
      async toggle() {
        this.value = await pickSessionTree(this.value, app)
      },
    }),
    // option({
    //   desc: "Manage Resources",
    //   name: "Resources",
    //   prop: ["resources"],
    //   async toggle() {
    //     const { pickResources } = await import("./resources.ts")
    //     await pickResources(app, { scope: opts.scope })
    //   },
    // }),
    toggle({
      desc: "Render images, if supported by the terminal",
      name: "Show Images",
      prop: ["ui", "images"],
    }),
    option({
      desc: "Maximum number of visible rows in selection lists, like pickers and autocomplete",
      name: "List Height",
      options: [10, 20, 30, 40],
      prop: ["ui", "listHeight"],
    }),
    option({
      desc: "Maximum number of visible rows for trees, like the session and resources tree",
      name: "Tree Height",
      options: [10, 20, 30, 40],
      prop: ["ui", "treeHeight"],
    }),
    option({
      desc: "Permissions preset to use",
      name: "Permissions Preset",
      options: ["strict", "readonly", "permissive", "yolo"],
      prop: ["permissions", "preset"],
    }),
    toggle({
      desc: "Allow skills to be used by the agent",
      name: "Enable Skills",
      prop: ["skills", "enabled"],
    }),
    toggle({
      desc: "Show skill actions",
      name: "Show Skill Actions",
      prop: ["skills", "actions"],
    }),
    option({
      desc: "Prefix for skill actions",
      name: "Skill Action Prefix",
      options: ["skill:", "", "sk:"],
      prop: ["skills", "actionPrefix"],
    }),
    option({
      desc: "Prefix for command actions",
      name: "Command Action Prefix",
      options: ["", "cmd:", "command:"],
      prop: ["commands", "actionPrefix"],
    }),
    toggle({
      desc: "Allow bash execution in commands",
      name: "Allow Bash in Commands",
      prop: ["commands", "bash"],
    }),
    toggle({
      desc: "Allow js expressions in command templates",
      name: "Allow JS Expressions in Commands",
      prop: ["commands", "expr"],
    }),
    toggle({
      desc: "Enable automatic compaction when context is full",
      name: "Auto Compaction",
      prop: ["compaction", "enabled"],
    }),
    option({
      desc: "Existing messages up to this many tokens will be preserved in the context",
      name: "Compaction Keep Tokens",
      options: [10_000, 20_000, 30_000, 40_000],
      prop: ["compaction", "keepTokens"],
    }),
    option({
      desc: "Reasoning effort for the compaction summary",
      name: "Compaction Reasoning Effort",
      options: REASONING_EFFORTS,
      prop: ["compaction", "reasoning"],
    }),
    option({
      desc: "Maximum number of tokens to use for the generated summary",
      name: "Compaction Summary Tokens",
      options: [5000, 10_000, 20_000],
      prop: ["compaction", "summaryTokens"],
    }),
    option({
      desc: "Threshold for automatic compaction",
      name: "Compaction Threshold",
      options: [0.75, 0.85, 0.95],
      prop: ["compaction", "threshold"],
    }),
  ]

  const ref = createRef<Select<ConfigItem>>()
  await app.pick({
    actions: {
      "config.reset": {
        desc: "Reset a config option",
        fn: () => {
          const select = ref()
          const active = select.item
          if (!active) return
          active.value = active.default
          select.invalidate()
        },
        keys: ["ctrl-x"],
        priority: 10,
      },
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
        keys: ["tab", "enter"],
        priority: 10,
      },
    },
    items,
    maxHeight: app.$.ui.listHeight,
    ref,
    render: renderer(),
    title: `Edit ${scope} config`,
    whichKey: true,
  })

  let changed = false
  for (const item of items) {
    if (is(item.value, item.initial)) continue
    // oxlint-disable-next-line no-await-in-loop
    await config.set(item.prop, is(item.value, item.default) ? undefined : item.value)
    changed = true
  }
  if (!changed) return
  app.notify(`Updated ${scope} config.`, { level: "success" })
  await app.reload()
}
