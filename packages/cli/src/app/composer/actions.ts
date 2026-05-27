import type { ActionCtx } from "@zaly/tui"
import type {
  ComposerCtx,
  ComposerFormatCtx,
  ComposerPlugin,
  ComposerSubmitCtx,
} from "../composer.ts"

import { sliceAnsi } from "@zaly/shared/ansi"

const actionRe = () => /^\s*\/([a-zA-Z_-]+)(?:\s+(.*))?$/

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
    const { codeToAnsi } = await import("@zaly/tui/shiki")
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
      actionCtx.args = await argsParse(args, action.args)
    }
    ctx.app.actions.dispatch(action, actionCtx)
  }
}
