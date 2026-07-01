import type { PluginApi } from "@zaly/plugin"

import { defineAction } from "@zaly/tui"

export default async function DebugPlugin(api: PluginApi) {
  api.ui.registerActions(
    defineAction({
      cmd: "debug",
      desc: "Print debug info about the current session, including prompts and tools.",
      args: {
        prompts: {
          short: "p",
          type: "boolean",
          desc: "Print the active prompts",
        },
        tools: {
          short: "t",
          type: "boolean",
          desc: "Print the active tools",
        },
      },
      fn: async ({ args }) => {
        const any = args?.prompts ?? args?.tools

        const prompt = await api.prompts.render()
        const tools = await api.tools.load()
        console.info("# Debug Info")

        if (args?.prompts || !any) {
          console.info("## Prompts")
          for (const p of prompt) console.log(p.text)
        }

        if (args?.tools || !any) {
          console.info("## Tools")
          for (const t of tools) console.log(t.name, t.params)
        }
      },
      id: "debug",
    })
  )
}
