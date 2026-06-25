import type {
  ConfigScope,
  ResourceFilter,
  ResourcePack,
  ResourcePackFilter,
  ResourceType,
} from "@zaly/config"
import type { AnyStyle, RenderCtx } from "@zaly/tui"
import type { Option, Select } from "@zaly/tui/widgets/select"
import type { TreeItem } from "@zaly/tui/widgets/tree"
import type { App } from "./app.ts"

import { RESOURCE_TYPES } from "@zaly/config"
import { prettyPath } from "@zaly/shared"
import { createRef } from "@zaly/tui"
import { capitalize } from "@zaly/tui/text"
import { basename, dirname } from "pathe"

type ResourceItem = Option & {
  render: (ctx: RenderCtx) => string
  icon?: (color: AnyStyle, ctx: RenderCtx) => string
  enabled: boolean
  children?: ResourceItem[]
} & (
    | { kind: "root" }
    | { kind: "pack"; pack: ResourcePack }
    | { kind: "type"; type: ResourceType }
    | { kind: "resource"; path: string }
  )

const icons = {
  checked: "[x]",
  disabled: "○",
  enabled: "●",
  partial: "◓",
  unchecked: "[ ]",
}

function resourceGroup(item: ResourceItem): ResourceItem {
  return {
    ...item,
    get enabled() {
      return this.children?.some((c) => c.enabled) ?? false
    },
    set enabled(value: boolean) {
      const current = this.enabled
      if (current === value) return
      for (const child of this.children ?? []) {
        child.enabled = value
      }
    },
    icon(color: AnyStyle, ctx: RenderCtx) {
      const s = ctx.style
      const count = this.children?.length ?? 0
      const enabled = this.children?.filter((c) => c.enabled).length ?? 0
      return s.add(color)(
        // oxlint-disable-next-line no-nested-ternary
        enabled === count ? icons.enabled : enabled === 0 ? icons.disabled : icons.partial
      )
    },
  }
}

type PackState = {
  prev: Map<string, boolean>
  next: Map<string, boolean>
}

class Resources {
  #packs = new Map<ResourcePack, PackState>()
  constructor(public app: App) {}

  async packResources(pack: ResourcePack, type: ResourceType): Promise<ResourceItem[]> {
    const all = await pack.all(type)
    if (!all.size) return []
    const group = this.#packs.get(pack) ?? { next: new Map(), prev: new Map() }
    this.#packs.set(pack, group)
    for (const [path, enabled] of all) {
      group.prev.set(path, enabled)
      group.next.set(path, enabled)
    }

    return [...all.keys()].toSorted().map((path) => ({
      get enabled() {
        return group.next.get(path) ?? false
      },
      set enabled(value: boolean) {
        group.next.set(path, value)
      },
      kind: "resource" as const,
      name: prettyPath(path, `${pack.dir}/${type}`),
      path,
      render(ctx: RenderCtx) {
        const s = ctx.style
        let name = prettyPath(path, `${pack.dir}/${type}`)
        if (type === "skills") name = dirname(name)
        else if (type === "commands") name = basename(name, ".md")
        const ref = this.enabled ? "mdListChecked" : "mdListUnchecked"
        const marker = s.add(ref)(this.enabled ? icons.checked : icons.unchecked)
        return `${marker} ${s[this.enabled ? "text" : "muted"](name)}`
      },
      text: path,
    }))
  }

  async packTypes(pack: ResourcePack): Promise<ResourceItem[]> {
    const types: ResourceItem[] = []
    await Promise.all(
      RESOURCE_TYPES.map(async (type) => {
        const children = await this.packResources(pack, type)
        if (!children.length) return
        types.push(
          resourceGroup({
            children,
            enabled: true,
            kind: "type" as const,
            render(ctx: RenderCtx) {
              const s = ctx.style
              const enabled = this.enabled
              return `${this.icon?.("primary", ctx)} ${s[enabled ? "primary" : "muted"](capitalize(type))}`
            },
            text: type,
            type,
          })
        )
      })
    )
    return types
  }

  async pack(pack: ResourcePack): Promise<ResourceItem | undefined> {
    const children = await this.packTypes(pack)
    if (!children.length) return
    return resourceGroup({
      children,
      enabled: true,
      kind: "pack" as const,
      pack,
      render(ctx: RenderCtx) {
        const s = ctx.style
        const name = pack.plugin?.uri ?? prettyPath(pack.dir)
        return `${this.icon?.("accent", ctx)} ${s.title(name)} ${s.muted(`[${pack.scope}]`)}`
      },
      text: pack.dir,
    })
  }

  async tree(filter?: ResourcePackFilter): Promise<ResourceItem> {
    const packs = this.app.ctx.config.resources.list(filter)
    const root: ResourceItem = {
      children: [],
      enabled: true,
      kind: "root",
      render: (ctx: RenderCtx) => ctx.style.title("Resources"),
      text: "Resources",
    }
    const items = await Promise.all(packs.map((pack) => this.pack(pack)))
    root.children = items.filter((item): item is TreeItem<ResourceItem> => !!item)
    return root
  }

  async save() {
    let reload = false
    for (const [pack, state] of this.#packs.entries()) {
      const changed =
        state.prev.size !== state.next.size ||
        [...state.prev.entries()].some(([path, enabled]) => state.next.get(path) !== enabled)
      if (!changed) continue
      const total = state.next.size
      const all = [...state.next.keys()]
      const enabled = all
        .filter((path) => state.next.get(path))
        .map((path) => path.slice(pack.dir.length + 1))
      const disabled = all
        .filter((path) => !state.next.get(path))
        .map((path) => path.slice(pack.dir.length + 1))

      let filter: ResourceFilter = {}
      if (total === enabled.length) filter = {}
      else if (enabled.length === 0) filter = { enabled: false }
      else if (enabled.length < total / 2) {
        filter = { include: enabled }
      } else {
        filter = { exclude: disabled }
      }
      // oxlint-disable-next-line no-await-in-loop
      await pack.updateFilter(filter)
      reload = true
    }
    if (reload) await this.app.reload()
  }
}

export async function pickResources(app: App, opts: { scope?: ConfigScope } = {}) {
  const resources = new Resources(app)
  const root = await resources.tree({ scope: opts.scope })
  if (!root.children?.length) {
    app.notify(`No ${opts.scope ? `**${opts.scope}** ` : ""}resources found.`, {
      level: "warn",
      title: "Resources",
    })
    return
  }
  const ref = createRef<Select<ResourceItem>>()
  const action = app.actions.get("resources.toggle")
  const keys = (action?.keys ?? ["space", "enter"]).map((k) => `\`<${k}>\``).join(" / ")
  await app.pick({
    actions: {
      "resources.toggle": {
        desc: "Toggle a resource",
        fn: () => {
          const select = ref()
          const active = select.item
          if (!active) return
          active.enabled = !active.enabled
          select.invalidate()
        },
        keys: ["space", "enter"],
        priority: 10,
      },
    },
    details: `Use ${keys} to toggle a resource on or off. Press \`<esc>\` to close.`,
    maxHeight: app.$.ui.treeHeight,
    ref,
    render: (item, ctx) => item.render(ctx),
    title: `Manage ${opts.scope ?? "all"} resources`,
    tree: root,
  })
  await resources.save()
}
