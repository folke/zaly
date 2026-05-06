/**
 * Run `*.bench.ts` files under `bench/`. Mitata accumulates each
 * file's `bench(...)` calls, so we can just import them in sequence
 * and finish with a single `run()` to print all results together.
 *
 *     bun run bench                       # everything
 *     bun bench/run.ts                    # everything
 *     bun bench/run.ts builder            # only files matching *builder*.bench.ts
 *     bun bench/run.ts builder.bench.ts   # an explicit filename also works
 */

import { run } from "mitata"
import { globSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))

// Optional CLI arg narrows the glob. Anything that doesn't already
// look like a glob gets wrapped as `*<arg>*` so partial names match
// (`builder` → `*builder*.bench.ts`); anything more explicit
// (`builder.bench.ts`, `*.foo.bench.ts`) is used as-is.
const arg = process.argv[2] as string | undefined
let pattern = "*.bench.ts"
if (arg !== undefined && arg !== "") {
  pattern = /[*?[]/.test(arg) || arg.endsWith(".bench.ts") ? arg : `*${arg}*.bench.ts`
}

const files = globSync(pattern, { cwd: here }).toSorted()
if (files.length === 0) {
  console.error(`no bench files matched pattern: ${pattern}`)
  process.exit(1)
}

for (const file of files) {
  await import(resolve(here, file))
}

await run()
