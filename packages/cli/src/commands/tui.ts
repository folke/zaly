import type { Cli } from "../cli.ts"

import { App } from "../app/app.ts"

/** Default handler when no subcommand is given — launches the
 *  long-lived TUI session. Lazy-imported by `Cli.tui()` so other
 *  subcommands (`zaly models`, `zaly session list`) don't pay the
 *  agent + renderer import cost. */
export async function run(cli: Cli): Promise<void> {
  const app = await App.start(cli)
  await app.waitExit()
}
