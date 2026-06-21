import type { Action } from "@zaly/tui"
import type { App } from "./app.ts"

import { Commands } from "@zaly/agent"

export async function loadCommands(app: App): Promise<void> {
  const paths = await app.config.resources.commands()

  const commands = new Commands({
    logger: app.ctx.logger.child("commands"),
    paths,
  })

  await commands.load()

  const ret: Action[] = []
  for (const cmd of commands.catalog.values()) {
    ret.push({
      args: cmd.args,
      cmd: `command:${cmd.name}`,
      desc: cmd.description,
      fn: async ({ args }) => {
        const text = await commands.format(args ?? "", cmd)
        console.log(text)
      },
      id: `command.${cmd.name}`,
      source: "commands",
    })
  }
  app.actions.delete({ source: "commands" })
  app.actions.register(ret, { default: false })
}
