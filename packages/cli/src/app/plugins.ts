import type { PluginHost } from "@zaly/plugin"
import type { App } from "./app.ts"

import { loadPlugin } from "@zaly/plugin"

export async function loadPlugins(app: App): Promise<void> {
  const config = await app.ctx.config()
  for (const plugin of app.plugins) {
    try {
      plugin.dispose()
    } catch (error) {
      app.ctx.logger.child("plugins").error(`Failed to dispose plugin \`${plugin.path}\`:`, error)
    }
  }

  const host: PluginHost = {
    ctx: app.agent.ctx,
    loadTheme: (name: string) => app.ctx.loadTheme(name),
    log: app.ctx,
    logger: app.ctx.logger.child("plugin"),
    notify: app.notify,
    pick: app.pick,
    renderer: app.renderer,
  }

  app.plugins = []
  const paths = await config.resources.plugins()
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
