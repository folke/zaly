import type { MetaPart, TextPart } from "@zaly/ai"

import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "pathe"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { readTool } from "../src/tools/read.ts"

type ReadResult = string | (TextPart | MetaPart)[]

let dir: string

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "zaly-read-test-"))
})
afterAll(() => {
  rmSync(dir, { force: true, recursive: true })
})

function fileWith(lines: number): string {
  const path = join(dir, `f-${lines}.txt`)
  const body = Array.from({ length: lines }, (_, i) => `line ${i + 1}`).join("\n")
  writeFileSync(path, body)
  return path
}

async function callRead(args: Record<string, unknown>): Promise<ReadResult> {
  return (await readTool.call(args as never, {})) as ReadResult
}

/** `readTool.call` returns either a string (untruncated) or a parts array
 *  ([MetaPart, TextPart] for truncated). Pull out the line-numbered text
 *  body either way so assertions stay focused. */
async function readBody(args: Record<string, unknown>): Promise<string> {
  const result = await callRead(args)
  if (typeof result === "string") return result
  const text = result.find((p): p is TextPart => p.type === "text")
  if (text === undefined) throw new Error("no text part in result")
  return text.text
}

/** Pull line numbers off the `cat -n`-style body. */
function lineNumbers(body: string): number[] {
  return body
    .split("\n")
    .map((l) => Number(l.slice(0, 6).trim()))
    .filter((n) => Number.isFinite(n))
}

describe("read tool — negative offset (tail-style)", () => {
  test("offset: -50 with default limit returns the last 50 lines", async () => {
    const path = fileWith(200)
    const body = await readBody({ offset: -50, path })
    const nums = lineNumbers(body)
    expect(nums[0]).toBe(151)
    expect(nums.at(-1)).toBe(200)
    expect(nums).toHaveLength(50)
  })

  test("offset: -50, limit: 20 reads 20 lines starting 50 from the end", async () => {
    const path = fileWith(200)
    const body = await readBody({ limit: 20, offset: -50, path })
    const nums = lineNumbers(body)
    expect(nums[0]).toBe(151)
    expect(nums.at(-1)).toBe(170)
    expect(nums).toHaveLength(20)
  })

  test("offset: -1 returns just the last line", async () => {
    const path = fileWith(200)
    const body = await readBody({ offset: -1, path })
    const nums = lineNumbers(body)
    expect(nums).toEqual([200])
  })

  test("negative offset larger than file clamps to start (whole file)", async () => {
    const path = fileWith(30)
    const body = await readBody({ offset: -1000, path })
    const nums = lineNumbers(body)
    expect(nums[0]).toBe(1)
    expect(nums.at(-1)).toBe(30)
    expect(nums).toHaveLength(30)
  })

  test("offset: 0 is treated as offset: 1 (head, off-by-one tolerance)", async () => {
    const path = fileWith(10)
    const body = await readBody({ limit: 3, offset: 0, path })
    const nums = lineNumbers(body)
    expect(nums).toEqual([1, 2, 3])
  })

  test("untruncated tail of small file returns plain string", async () => {
    const path = fileWith(5)
    const result = await callRead({ offset: -10, path })
    // Whole file fits, no truncation → plain string return
    expect(typeof result).toBe("string")
  })

  test("truncated tail surfaces correct showing range in MetaPart", async () => {
    const path = fileWith(200)
    const result = await callRead({ limit: 20, offset: -50, path })
    if (typeof result === "string") throw new Error("expected truncated parts array")
    const meta = result.find((p): p is MetaPart => p.type === "meta")
    if (meta === undefined) throw new Error("no meta part")
    const data = meta.data as { showing: [number, number]; total: number }
    expect(data.total).toBe(200)
    expect(data.showing).toEqual([151, 170])
  })
})
