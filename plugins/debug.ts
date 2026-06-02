import type { PluginApi } from "@zaly/plugin"

import { formatTokenStats, tokenStats } from "@zaly/agent/debug"

export default async function DebugPlugin(api: PluginApi) {
  api.ui.registerActions({
    cmd: "debug",
    desc: "A debug action that shows a notification when triggered",
    fn: async () => {
      api.ui.notify("Debug action performed!")
      const prompt = await api.prompts.render()
      const tools = await api.tools.load()
      const promptLen = prompt.reduce((sum, p) => sum + p.length, 0)
      for (const p of prompt) console.log(p)
      console.log("Loaded tools:", Object.fromEntries(tools.map((t) => [t.name, t.params])))
      const stats = await tokenStats(api.agent.messages)
      stats.byRole.set("prompt", new Map([["total", { count: prompt.length, tokens: promptLen }]]))
      console.log(formatTokenStats(stats))
    },
    id: "debug",
  })
}
