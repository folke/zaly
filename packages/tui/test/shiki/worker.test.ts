import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, test } from "vitest"

test("completes highlighting and exits with an idle worker under Node", () => {
  const clientURL = new URL("../../src/shiki/client.ts", import.meta.url).href
  const dir = mkdtempSync(join(tmpdir(), "zaly-shiki-node-"))
  try {
    const script = join(dir, "highlight.mjs")
    writeFileSync(
      script,
      `
        import { stripVTControlCharacters } from "node:util"
        import { ShikiWorkerClient } from ${JSON.stringify(clientURL)}

        const client = new ShikiWorkerClient({ timeout: 10_000 })
        const result = await client.highlight("const answer = 42", "typescript")
        console.log(JSON.stringify({
          error: result.error,
          plain: stripVTControlCharacters(result.value),
          colored: result.value.includes("\\x1b["),
        }))
      `
    )
    const result = spawnSync("node", [script], {
      encoding: "utf8",
      env: { ...process.env, FORCE_COLOR: "3", NO_COLOR: undefined, NODE_OPTIONS: undefined },
      timeout: 20_000,
    })

    expect(result.error).toBeUndefined()
    expect(result.status, result.stderr).toBe(0)
    expect(JSON.parse(result.stdout)).toEqual({
      plain: "const answer = 42",
      colored: true,
    })
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
}, 30_000)
