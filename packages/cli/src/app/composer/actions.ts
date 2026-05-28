import type { ArgsOpts } from "@zaly/shared/args"
import type { Action, ActionCtx } from "@zaly/tui"
import type { ArgsDef } from "citty"
import type {
  ComposerCtx,
  ComposerFormatCtx,
  ComposerPlugin,
  ComposerSubmitCtx,
} from "../composer.ts"

import { sliceAnsi } from "@zaly/shared/ansi"
import { argsUsage } from "@zaly/shared/args"
import { codeToAnsi } from "@zaly/tui"
import { text } from "@zaly/tui/widgets/text"
import { defineCommand, renderUsage } from "citty"

const actionRe = () => /^\s*\/([a-zA-Z_:-]+)(?:\s+(.*))?$/

export class ActionsComposer implements ComposerPlugin {
  name = "actions"
  when = actionRe()

  async format(value: string, ctx: ComposerFormatCtx) {
    const actionMatch = value.match(actionRe())
    if (!actionMatch) return
    ctx.stop()

    const s = ctx.style
    const cmd = actionMatch[1]
    const args = actionMatch[2] || ""
    value = await codeToAnsi(`${cmd} ${args}`, "bash", s.theme.shiki)
    value = s.primary(cmd) + sliceAnsi(value, cmd.length)
    return `${s.divider("/")}${value}`
  }

  validate(value: string, ctx: ComposerCtx): true | string {
    const actionMatch = value.match(actionRe())
    if (!actionMatch) return true
    ctx.stop()

    const action = ctx.app.actions.find({ cmd: actionMatch[1] })
    if (!action) return `Unknown action: \`${actionMatch[1]}\`.`
    return true
  }

  async submit(value: string, ctx: ComposerSubmitCtx): Promise<void> {
    const actionMatch = value.match(actionRe())
    if (!actionMatch) return
    ctx.stop()

    const name = actionMatch[1]
    const args = actionMatch[2] || ""
    const action = ctx.app.actions.find({ cmd: name })
    if (!action) {
      ctx.app.notify(`Unknown action: \`${name}\`.`, { level: "error" })
      return
    }
    const actionCtx: ActionCtx = { id: action.id, source: "input" }
    if (action.args) {
      const { argsParse } = await import("@zaly/shared/args")
      const def: ArgsOpts = {
        help: { short: "h", type: "boolean" },
        ...(action.source === "commands"
          ? { preview: { desc: "Show a preview of the command template.", type: "boolean" } }
          : {}),
        ...action.args,
      }
      actionCtx.args = await argsParse(args, def)
      if (actionCtx.args.help) {
        const usage = argsUsage(`/${name}`, def)
        ctx.app.ctx.success(
          // action.desc ?? name,
          text(async ({ style }) => (await this.format(usage, { ...ctx, style })) ?? usage),
          text(await renderHelp(action, def))
        )
        return
      }
    }
    ctx.app.actions.dispatch(action, actionCtx)
  }
}

async function renderHelp(action: Action, args: ArgsOpts): Promise<string> {
  const { help: _, ...def } = args
  delete def.help
  const cmd = defineCommand({
    args: Object.fromEntries(
      Object.entries(def).map(([k, v]) => [
        k,
        {
          alias: v.short ? [v.short] : undefined,
          default: v.default,
          description: v.desc,
          type: v.type,
        },
      ])
    ) as ArgsDef,
    meta: {
      description: action.desc,
      name: action.cmd,
    },
  })
  return await renderUsage(cmd)
}
