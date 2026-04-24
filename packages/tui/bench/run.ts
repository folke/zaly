/**
 * Run every `*.bench.ts` file under `bench/`. Mitata accumulates each
 * file's `bench(...)` calls, so we can just import them in sequence and
 * finish with a single `run()` to print all results together.
 *
 *     bun run bench
 *     bun bench/run.ts
 */

import { run } from "mitata"
import { globSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const files = globSync("*.bench.ts", { cwd: here }).toSorted()

for (const file of files) {
  await import(resolve(here, file))
}

await run()
