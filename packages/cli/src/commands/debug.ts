// oxlint-disable sort-keys

import type { Cli } from "../cli.ts"
import type { CmdArgs } from "../types.ts"

import { formatTokenStats, tokenStats } from "@zaly/agent"
import { defineCommand } from "citty"

type DebugArgs = CmdArgs<typeof debugCommand>

export function debugCommand(cli: Cli) {
  return defineCommand({
    meta: {
      name: "debug",
      description: "Debugging utilities.",
      hidden: true,
    },
    args: {
      stats: {
        type: "boolean",
        description: "Show debug stats about the current session",
        default: false,
      },
    },
    run: ({ args }) => run(cli, args),
  })
}

async function run(cli: Cli, _args: DebugArgs): Promise<void> {
  const session = await cli.ctx.session()
  const stats = tokenStats(session.messages)
  console.log(formatTokenStats(stats))
}
