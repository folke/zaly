// oxlint-disable sort-keys

import type { ParsedArgs } from "citty"
import type { Cli } from "../cli.ts"

import { listModels } from "@zaly/ai"
import { defineCommand } from "citty"

type ModelsArgs = ParsedArgs<{
  pattern: { type: "positional"; required: false }
  all: { type: "boolean"; default: false }
  json: { type: "boolean"; default: false }
}>

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
    run: ({ args }) => run(cli, args as unknown as ModelsArgs),
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

  for (const id of Object.keys(models)) {
    console.log(id)
  }
}
