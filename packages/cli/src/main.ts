import { App } from "./app.ts"
import { resolveConfig } from "./config.ts"

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  const config = resolveConfig(argv)
  await App.start(config)
}
