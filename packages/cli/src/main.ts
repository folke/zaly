import { runMain } from "citty"
import { Cli, mainCommand } from "./cli.ts"

process.title = "zaly"
process.env.ZALY = "1"
process.env.AGENT = "1"
process.env.AI_AGENT = "zaly"

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  const cli = new Cli()
  await runMain(mainCommand(cli), { rawArgs: [...argv] })
}
