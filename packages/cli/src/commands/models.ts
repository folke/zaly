// oxlint-disable sort-keys

import type { Cli } from "../cli.ts"
import type { CmdArgs } from "../types.ts"

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
      "context-size": {
        type: "string",
        description:
          "Filter for models with at least this context size. Suffixes K, M, B accepted.",
        required: false,
      },
      input: {
        type: "enum",
        options: ["text", "image", "audio", "video"],
        description: "Filter for models accepting this input modality",
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
      limit: {
        type: "string",
        description: "Limit the number of models listed",
        required: false,
      },
    },
    run: ({ args }) => run(cli, args as unknown as ModelsArgs),
  })
}

async function run(cli: Cli, args: ModelsArgs): Promise<void> {
  // Default: only models the current auth chain can authenticate.
  // `--all`: every catalog row, regardless of local credentials.
  const ctx = cli.ctx
  const model = await ctx.model()
  const cs = args.contextSize ? args.contextSize.match(/^(\d+)\s*([kmb])?$/i) : undefined
  let contextSize: number | undefined
  if (cs) {
    contextSize = parseInt(cs[1], 10)
    const suffix = cs[2]?.toLowerCase()
    if (suffix === "k") contextSize *= 1e3
    else if (suffix === "m") contextSize *= 1e6
    else if (suffix === "b") contextSize *= 1e9
  }

  let models = await model.list({
    auth: args.all ? undefined : true,
    filter: args.pattern,
    contextSize,
    modality: args.input,
  })
  if (args.limit) models = models.slice(0, parseInt(args.limit, 10))
  if (args.json) {
    console.log(JSON.stringify(models, undefined, 2))
    return
  }

  const rows: string[] = [
    "| Model Id | Reasoning | Context limit | Modalities | Release Date |",
    "|-|-:|-:|-|-:|",
  ]
  for (const m of models) {
    const row = [
      `**${m.id}**`,
      m.reasoning ? "**✓**" : "",
      `\`${formatNumber(m.contextSize)}\``,
      m.input.toSorted().join(", "),
      m.info?.release_date ?? "",
    ]
    rows.push(`| ${row.join(" | ")} |`)
  }
  ctx.log(rows.join("\n"))
}
