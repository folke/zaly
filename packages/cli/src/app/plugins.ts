import type { ConfigScope } from "@zaly/config"
import type { Plugin } from "@zaly/config/plugin"
import type { PluginHost } from "@zaly/plugin"
import type { PickerItem } from "@zaly/tui/widgets/picker"
import type { App } from "./app.ts"

import { loadPlugin } from "@zaly/plugin"
import { createProgressive, signal } from "@zaly/tui"

export async function loadPlugins(app: App): Promise<void> {
  for (const plugin of app.plugins) {
    try {
      // oxlint-disable-next-line no-await-in-loop
      await plugin.dispose()
    } catch (error) {
      app.ctx.logger.child("plugins").error(`Failed to dispose plugin \`${plugin.path}\`:`, error)
    }
  }

  const host: PluginHost = {
    ctx: app.agent.ctx,
    loadTheme: (name: string) => app.ctx.loadTheme(name),
    log: app.ctx,
    logger: app.ctx.logger.child("plugin"),
    model: await app.ctx.model(),
    notify: app.notify,
    pick: app.pick,
    prompt: (msg: string) => app.prompt.open(msg),
    prompts: await app.ctx.prompts(),
    renderer: app.renderer,
    tools: await app.ctx.tools(),
  }

  app.plugins = []
  const paths = await app.config.resources.plugins()
  const results = await Promise.all(paths.map((path) => loadPlugin(path, host)))
  for (const result of results) {
    if (result.ok) app.plugins.push(result.plugin)
    else
      app.notify(`Failed to load plugin **${result.plugin.name}**:\n${result.error.message}`, {
        level: "error",
        title: `Plugin ${result.plugin.name}`,
      })
  }
}

function pluginList(packs: Plugin[]): string {
  return packs.map((p) => `- \`${p.source.uri}\``).join("\n")
}

export async function updatePlugins(app: App, opts: { plugins?: Plugin[] } = {}): Promise<boolean> {
  const packs = await app.ctx.packs()
  const updates = opts.plugins ?? (await packs.updates())
  if (updates.length === 0) {
    app.notify("All plugins are up to date.", { level: "success" })
    return false
  }
  using _ = app.withLoading()
  let updating = true
  app.notify(`Updating plugins:\n${pluginList(updates)}`, {
    keep: () => updating,
  })
  const ok = await app.ctx.logger.try(async () => {
    await packs.update(updates)
    app.notify(`Updated:\n${pluginList(updates)}`, { level: "success" })
    return true
  }, "packs")
  if (!ok) app.notify("Failed to update plugins.", { level: "error", timeout: 10_000 })
  updating = false

  // Reload, so that updates are loaded and any new resources are available
  await app.reload()

  return true
}

export async function installMissing(app: App): Promise<boolean> {
  const packs = await app.ctx.packs()
  const missing = await packs.missing()
  if (missing.length === 0) return false
  let installing = true
  app.notify(`Installing plugins:\n${pluginList(missing)}`, { keep: () => installing })
  const ok = await app.ctx.logger.try(async () => {
    await packs.install(missing)
    app.notify(`Installed:\n${pluginList(missing)}`, { level: "success" })
    return true
  }, "packs")
  if (!ok) app.notify("Failed to install plugins.", { level: "error", timeout: 10_000 })
  installing = false
  return true
}

export async function installPlugins(
  app: App,
  opts: { scope?: ConfigScope; plugins?: string[] } = {}
): Promise<boolean> {
  const uris = opts.plugins ?? []
  if (uris.length === 0) {
    const uri = await app.prompt.open("Enter the plugin URI to install:")
    if (!uri) return false
    uris.push(uri)
  }

  using _ = app.withLoading()

  const scope = opts.scope ?? "user"

  const ret = await app.ctx.config[scope]?.update((config) => {
    const plugins = new Set(config?.plugins)
    for (const uri of uris) plugins.add(uri)
    return { ...config, plugins: [...plugins] }
  })
  if (!ret) return false

  // Reload will install missing plugins and load them
  await app.reload()
  return true
}

export async function removePlugin(app: App, plugin: Plugin): Promise<boolean> {
  const scope = plugin.source.scope
  const uri = plugin.source.uri

  const ret = await app.ctx.config[scope]?.update((config) => ({
    ...config,
    plugins: (config?.plugins ?? []).filter((p) => p !== uri),
  }))

  if (!ret) return false

  await app.reload()
  return true
}

export async function pluginUpdates(app: App, opts: { notify?: boolean } = {}): Promise<void> {
  const packs = await app.ctx.packs()
  const updates = await packs.updates()
  if (updates.length === 0) {
    if (opts.notify) app.notify("All plugins are up to date.", { level: "success" })
    return
  }
  app.notify(`Plugin updates available:\n${pluginList(updates)}`, { level: "warn" })
}

type PluginItem = PickerItem & { plugin: Plugin; update?: boolean }

export async function managePlugins(app: App, opts: { scope?: ConfigScope } = {}): Promise<void> {
  const [gen, setGen] = signal(0)

  const items = createProgressive<PluginItem[]>(
    async (ctx) => {
      gen() // track generation
      const manager = await app.ctx.packs()
      const all = await manager.packs()
      const ret: PluginItem[] = all.map((p) => ({
        plugin: p,
        text: p.source.uri,
      }))
      ctx.set(ret)
      const updates = new Set(await manager.updates())
      for (const item of ret) item.update = updates.has(item.plugin)
      return ret
    },
    { initialValue: [], throttle: 0 }
  )

  const update = () => setGen((g) => g + 1)

  await app.pick<PluginItem>({
    actions: {
      "plugin.install": {
        desc: "Install a plugin.",
        fn: async () => {
          await installPlugins(app, opts)
          update()
        },
        keys: ["alt-i"],
      },
      "plugin.remove": {
        desc: "Remove the selected plugin.",
        fn: async ({ node }) => {
          const item = node.item
          if (!item) return
          const ok = await removePlugin(app, item.plugin)
          if (ok) {
            node.invalidate()
            update()
          }
        },
        keys: ["alt-r"],
      },
      "plugin.update": {
        desc: "Update the selected plugin.",
        fn: async ({ node }) => {
          const item = node.item
          if (!item) return
          const ok = await updatePlugins(app, { plugins: [item.plugin] })
          if (ok) {
            item.update = false
            node.invalidate()
            update()
          }
        },
        keys: ["alt-u"],
      },
    },
    items,
    render: (item, ctx) => {
      const delim = ctx.style.delim(" • ")
      const s = ctx.style
      const p = item.plugin
      const scope = s.primary(p.source.scope)
      let status = s.muted("checking...")
      if (item.update !== undefined)
        status = item.update ? s.warn("update available") : s.success("up to date")
      return `${s.bold(p.source.uri)}${delim}${scope}${delim}${status}`
    },
    title: "Manage Plugins",
    whichKey: true,
  })
}
