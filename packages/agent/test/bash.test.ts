import { isStreamable, justText } from "@zaly/ai"
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { setTimeout } from "node:timers/promises"
import { join } from "pathe"
import { afterAll, expect, test } from "vitest"
import { bashTool } from "../src/tools/bash.ts"

const dir = mkdtempSync(join(tmpdir(), "zaly-bash-test-"))
afterAll(() => rmSync(dir, { force: true, recursive: true }))

test("bash defaults to 200 inline lines", async () => {
  const args = await bashTool.validator.validateParams({ command: "true" })
  expect(args.limit).toBe(200)
})

test("bash rejects a zero line limit", async () => {
  await expect(bashTool.validator.validateParams({ command: "true", limit: 0 })).rejects.toThrow()
})

test.each([1, 5])("bash accepts limit %i and saves complete output", async (limit) => {
  const args = await bashTool.validator.validateParams({
    command: String.raw`printf 'line %s\n' {1..10}`,
    limit,
  })
  const stream = await bashTool.call(args, { sessionDir: dir })
  if (!isStreamable(stream)) throw new Error("Expected a streamable bash result")
  await stream.done
  const result = stream.poll()
  const text = justText(result.content)
  const expected =
    limit === 1
      ? " [ … truncated 9 lines]\nline 10"
      : "line 1\nline 2\n [ … truncated 5 lines]\nline 8\nline 9\nline 10"
  expect(text).toBe(expected)
  if (!Array.isArray(result.content)) throw new Error("Expected content parts")
  const meta = result.content.find((part) => part.type === "meta")?.data as {
    truncated: { fullOutputPath: string; totalLines: number }
  }
  expect(meta.truncated.totalLines).toBe(10)
  const fullOutput = Array.from({ length: 10 }, (_, i) => `line ${i + 1}\n`).join("")
  let saved = ""
  for (let i = 0; i < 100 && saved !== fullOutput; i++) {
    await setTimeout(10)
    if (existsSync(meta.truncated.fullOutputPath))
      saved = readFileSync(meta.truncated.fullOutputPath, "utf8")
  }
  expect(saved).toBe(fullOutput)
})
