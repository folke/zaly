import type { Action } from "@zaly/tui"
import type { App } from "./app.ts"

import { Commands } from "@zaly/agent"
import { defineAction } from "@zaly/tui"

export async function loadCommands(app: App): Promise<void> {
  const paths = await app.config.resources.commands()

  const commands = new Commands({
    logger: app.ctx.logger.child("commands"),
    paths,
  })

  await commands.load()

  const ret: Action[] = []
  for (const cmd of commands.catalog.values()) {
    ret.push(
      defineAction({
        args: {
          ...cmd.args,
          preview: {
            desc: "Show a preview of the command template.",
            type: "boolean",
          },
        },
        cmd: `${app.settings.actions.commandPrefix ? "command:" : ""}${cmd.name}`,
        desc: cmd.description,

        fn: async ({ args }) => {
          const text = await commands.format(args ?? "", cmd)
          if (args?.preview) {
            console.log(text)
          } else
            app.agent.send([
              {
                content: text,
                meta: { markdown: true, name: cmd.name, source: "command" },
                role: "user",
              },
            ])
        },
        id: `command.${cmd.name}`,
        source: "commands",
      })
    )
  }
  app.actions.delete({ source: "commands" })
  app.actions.register(ret, { default: false })
}
