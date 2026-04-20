/**
 * Run every `*.bench.ts` file under `bench/`. Mitata accumulates each
 * file's `bench(...)` calls, so we can just import them in sequence and
 * finish with a single `run()` to print all results together.
 *
 *     bun run bench
 *     bun bench/run.ts
 */

import { globSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { run } from "mitata"

const here = dirname(fileURLToPath(import.meta.url))
const files = globSync("*.bench.ts", { cwd: here }).sort()

for (const file of files) {
  // eslint-disable-next-line no-await-in-loop -- each bench file registers benches on import
  await import(resolve(here, file))
}

await run()
