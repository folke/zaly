// oxlint-disable sort-keys

import type { Cli } from "../cli.ts"
import type { CmdArgs } from "../types.ts"

import { listModels } from "@zaly/ai"
import { formatNumber } from "@zaly/shared"
import { defineCommand } from "citty"

type ModelsArgs = CmdArgs<typeof modelsCommand>

export function modelsCommand(cli: Cli) {
  return defineCommand({
    meta: {
      name: "models",
      description: "List available models. Defaults to authenticated only.",
    },
    args: {
      pattern: {
        type: "positional",
        description: "Substring filter for model ids",
        required: false,
      },
      all: {
        type: "boolean",
        description: "Show all catalog models, including those without local auth",
        default: false,
      },
      json: {
        type: "boolean",
        description: "Emit raw catalog rows as JSON",
        default: false,
      },
    },
    run: ({ args }) => run(cli, args),
  })
}

async function run(_cli: Cli, args: ModelsArgs): Promise<void> {
  // Default: only models the current auth chain can authenticate.
  // `--all`: every catalog row, regardless of local credentials.
  const models = await listModels({
    auth: args.all ? undefined : true,
    filter: args.pattern,
  })

  if (args.json) {
    console.log(JSON.stringify(models, undefined, 2))
    return
  }

  const ctx = _cli.ctx

  const rows: string[] = [
    "| Model Id | Reasoning | Context limit | Modalities | Release Date |",
    "|-|-:|-:|-|-:|",
  ]
  for (const [id, m] of Object.entries(models)) {
    const row = [
      `**${id}**`,
      m.reasoning ? "**✓**" : "",
      `\`${formatNumber(m.contextSize)}\``,
      m.input.toSorted().join(", "),
      m.info?.release_date ?? "",
    ]
    rows.push(`| ${row.join(" | ")} |`)
  }
  ctx.log(rows.join("\n"))
}
