import type { Message } from "@zaly/ai"
import type { PluginApi } from "@zaly/plugin"

import { stringifyContent } from "@zaly/ai"
import { defineAction } from "@zaly/tui"

export default async function DebugPlugin(api: PluginApi) {
  api.ui.registerActions(
    defineAction({
      args: {
        prompts: {
          desc: "Print the active prompts",
          short: "p",
          type: "boolean",
        },
        summary: {
          desc: "Print the compaction summary",
          short: "s",
          type: "boolean",
        },
        tools: {
          desc: "Print the active tools",
          short: "t",
          type: "boolean",
        },
      },
      cmd: "debug",
      desc: "Print debug info about the current session, including prompts and tools.",
      fn: async ({ args }) => {
        const any = args?.prompts === true || args?.tools === true || args?.summary === true

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

        if (args?.summary || !any) {
          const summary = api.agent.messages.find(
            (m): m is Message<"system"> =>
              m.role === "system" && m.meta?.kind === "compaction-summary"
          )
          if (summary) {
            console.info("## Compaction Summary")
            console.log(stringifyContent(summary.content))
          }
        }
      },
      id: "debug",
    })
  )
}
