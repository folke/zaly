import type { BashTool } from "@zaly/agent"
import type { ParamsOf } from "@zaly/ai"
import type { ComposerFormatCtx, ComposerPlugin, ComposerSubmitCtx } from "../composer.ts"

const bashCmdRe = () => /^(\s*!\s*)(.*)$/

export class BashComposer implements ComposerPlugin {
  name = "bash"
  when = bashCmdRe()

  async format(value: string, ctx: ComposerFormatCtx) {
    const bashMatch = value.match(bashCmdRe())
    if (!bashMatch) return
    ctx.stop()
    const s = ctx.style
    const prefix = bashMatch[1]
    const command = bashMatch[2]
    const { codeToAnsi } = await import("@zaly/tui/shiki")
    value = await codeToAnsi(command, "bash", s.theme.shiki)
    return `${s.divider(prefix)}${value}`
  }

  async submit(value: string, ctx: ComposerSubmitCtx): Promise<void> {
    const bashMatch = value.match(bashCmdRe())
    if (!bashMatch) return
    const command = bashMatch[2]
    const toolUse = await ctx.agent.useTool<BashTool>(
      "bash",
      { command } as ParamsOf<BashTool>,
      "Bash command from the previous user message was executed automatically"
    )
    ctx.agent.send(toolUse.messages, { run: false })
  }
}
