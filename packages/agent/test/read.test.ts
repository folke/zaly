import type { Message, MetaPart, TextPart, ToolContext, ToolResultPart } from "@zaly/ai"

import { AiError } from "@zaly/ai"
import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "pathe"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { assertFresh, readTool } from "../src/tools/read.ts"

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
  // Mirror the runtime path: coerce + apply schema defaults before
  // invoking `call`. Calling `call` directly skips defaults like
  // `limit` and `offset`, so the test would diverge from production.
  const validated = await readTool.validator.validateParams(args)
  return (await readTool.call(validated, {})) as ReadResult
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
    // The slice meta carries a human-readable "showing X-Y of Z" string
    // in `content`, not structured `data`.
    const text = typeof meta.content === "string" ? meta.content : ""
    expect(text).toBe("showing 151-170 of 200")
  })
})

describe("read tool — error paths", () => {
  test("missing file → NOT_FOUND AiError", async () => {
    await expect(callRead({ path: join(dir, "nope.txt") })).rejects.toMatchObject({
      code: "NOT_FOUND",
    })
  })

  test("path that resolves to a directory → NOT_A_FILE", async () => {
    const sub = join(dir, "subdir")
    mkdirSync(sub, { recursive: true })
    await expect(callRead({ path: sub })).rejects.toMatchObject({ code: "NOT_A_FILE" })
  })

  test("offset past end yields empty content with a truthful slice meta", async () => {
    // Rather than erroring on overshoot, the read returns an empty text
    // part plus a `<slice>` meta surfacing the offset asked for and the
    // real file size — the agent can re-issue with a sensible offset.
    const path = fileWith(5)
    const result = await callRead({ offset: 999, path })
    expect(Array.isArray(result)).toBe(true)
    const parts = result as { type: string; content?: string; text?: string }[]
    const slice = parts.find((p) => p.type === "meta")
    const text = parts.find((p) => p.type === "text")
    expect(slice?.content).toMatch(/offset 999 past end of file \(5 lines\)/)
    expect(text?.text).toBe("")
  })

  test("over-long lines are truncated inline with a marker", async () => {
    const path = join(dir, "long.txt")
    writeFileSync(path, "x".repeat(3000))
    const body = await readBody({ path })
    expect(body).toMatch(/line truncated, 3000 chars/)
  })

  test("non-image binary file → BINARY_FILE AiError", async () => {
    const path = join(dir, "bin.dat")
    writeFileSync(path, Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 0]))
    await expect(callRead({ path })).rejects.toMatchObject({ code: "BINARY_FILE" })
  })

  test("PNG image returns an ImagePart attachment", async () => {
    // Real 1×1 PNG so imageInfo can read dimensions.
    const path = join(dir, "tiny.png")
    writeFileSync(
      path,
      Buffer.from(
        "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082",
        "hex"
      )
    )
    const r = await callRead({ path })
    if (typeof r === "string") throw new Error("expected parts array")
    const img = (r as { type: string }[]).find((p) => p.type === "image")
    expect(img).toBeDefined()
  })
})

function withReadOf(path: string, mtime: number): Message<"tool"> {
  const part: ToolResultPart = {
    content: "",
    id: "1",
    meta: { kind: "read", mtime, path },
    name: "read",
    type: "tool-result",
  }
  return { content: [part], id: "m1", role: "tool" }
}

describe("trackFile / assertFresh", () => {
  test("assertFresh throws NOT_FOUND when the path doesn't exist", () => {
    const ctx: ToolContext = { messages: [] }
    expect(() => assertFresh(join(dir, "missing-fresh.txt"), ctx)).toThrow(AiError)
  })

  test("assertFresh throws NOT_READ when no prior read for this path", () => {
    const path = join(dir, "fresh-not-read.txt")
    writeFileSync(path, "hello")
    expect(() => assertFresh(path, { messages: [] })).toThrow(/read this file before/i)
  })

  test("assertFresh succeeds when a recent read message records the current mtime", () => {
    const path = join(dir, "fresh-ok.txt")
    writeFileSync(path, "hello")
    const mtime = statSync(path).mtimeMs
    const ctx: ToolContext = { messages: [withReadOf(path, mtime)] }
    expect(() => assertFresh(path, ctx)).not.toThrow()
  })

  test("assertFresh throws STALE when the prior read mtime no longer matches", () => {
    const path = join(dir, "fresh-stale.txt")
    writeFileSync(path, "hello")
    // Pretend we read this file with a different mtime.
    const ctx: ToolContext = { messages: [withReadOf(path, 1)] }
    expect(() => assertFresh(path, ctx)).toThrow(/changed since last read/)
  })
})
