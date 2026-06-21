import type { Pack } from "@zaly/config/pack"
import type { PluginHost } from "@zaly/plugin"
import type { App } from "./app.ts"

import { loadPlugin } from "@zaly/plugin"

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

function packList(packs: Pack[]): string {
  return packs.map((p) => `- \`${p.uri}\``).join("\n")
}

export async function packUpdate(app: App): Promise<boolean> {
  const packs = await app.ctx.packs()
  const updates = await packs.updates()
  if (updates.length === 0) {
    app.notify("All packages are up to date.", { level: "success" })
    return false
  }
  let updating = true
  app.notify(`Updating packages:\n${packList(updates)}`, {
    keep: () => updating,
  })
  const ok = await app.ctx.logger.try(async () => {
    await packs.update(updates)
    app.notify(`Updated:\n${packList(updates)}`, { level: "success" })
    return true
  }, "packs")
  if (!ok) app.notify("Failed to update packages.", { level: "error", timeout: 10_000 })
  updating = false
  return true
}

export async function packInstall(app: App): Promise<boolean> {
  const packs = await app.ctx.packs()
  const missing = await packs.missing()
  if (missing.length === 0) return false
  let installing = true
  app.notify(`Installing missing packages:\n${packList(missing)}`, { keep: () => installing })
  const ok = await app.ctx.logger.try(async () => {
    await packs.install(missing)
    app.notify(`Installed:\n${packList(missing)}`, { level: "success" })
    return true
  }, "packs")
  if (!ok) app.notify("Failed to install packages.", { level: "error", timeout: 10_000 })
  installing = false
  return true
}

export async function packUpdates(app: App, opts: { notify?: boolean } = {}): Promise<void> {
  const packs = await app.ctx.packs()
  const updates = await packs.updates()
  if (updates.length === 0) {
    if (opts.notify) app.notify("All packages are up to date.", { level: "success" })
    return
  }
  app.notify(`Package updates available:\n${packList(updates)}`, { level: "warn" })
}
