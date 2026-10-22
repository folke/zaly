import type { Message, MetaPart, TextPart, ToolContext, ToolResultPart } from "@zaly/ai"
import type { ReadToolMeta } from "../src/tools/read.ts"
import type { FileMeta } from "../src/utils/file.ts"

import { mkdirSync, mkdtempSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs"
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
  // Mirror the runtime path: coerce + apply schema defaults before
  // invoking `call`. Calling `call` directly skips defaults like
  // `limit` and `offset`, so the test would diverge from production.
  const validated = await readTool.validator.validateParams(args)
  return (await readTool.call(validated, {})) as ReadResult
}

/** Extract the plain text body independently of slice metadata. */
async function readBody(args: Record<string, unknown>): Promise<string> {
  const result = await callRead(args)
  if (typeof result === "string") return result
  const text = result.find((p): p is TextPart => p.type === "text")
  if (text === undefined) throw new Error("no text part in result")
  return text.text
}

describe("read tool — negative offset (tail-style)", () => {
  test("offset: -50 with default limit returns the last 50 lines", async () => {
    const path = fileWith(200)
    const body = await readBody({ offset: -50, path })
    expect(body.split("\n")).toEqual(Array.from({ length: 50 }, (_, i) => `line ${151 + i}`))
  })

  test("offset: -50, limit: 20 reads 20 lines starting 50 from the end", async () => {
    const path = fileWith(200)
    const body = await readBody({ limit: 20, offset: -50, path })
    expect(body.split("\n")).toEqual(Array.from({ length: 20 }, (_, i) => `line ${151 + i}`))
  })

  test("offset: -1 returns just the last line", async () => {
    const path = fileWith(200)
    const body = await readBody({ offset: -1, path })
    expect(body).toBe("line 200")
  })

  test("negative offset larger than file clamps to start (whole file)", async () => {
    const path = fileWith(30)
    const body = await readBody({ offset: -1000, path })
    expect(body.split("\n")).toEqual(Array.from({ length: 30 }, (_, i) => `line ${i + 1}`))
  })

  test("offset: 0 is treated as offset: 1 (head, off-by-one tolerance)", async () => {
    const path = fileWith(10)
    const body = await readBody({ limit: 3, offset: 0, path })
    expect(body).toBe("line 1\nline 2\nline 3")
  })

  test("full tail read includes slice metadata and unnumbered text", async () => {
    const path = fileWith(5)
    const result = await callRead({ offset: -10, path })
    expect(result).toEqual([
      { content: "showing 1-5 of 5", tag: "slice", type: "meta" },
      { text: "line 1\nline 2\nline 3\nline 4\nline 5", type: "text" },
    ])
  })

  test("default full read includes slice metadata and preserves indentation", async () => {
    const path = join(dir, "indented.txt")
    writeFileSync(path, "  first\n\tsecond\n")
    expect(await callRead({ path })).toEqual([
      { content: "showing 1-2 of 2", tag: "slice", type: "meta" },
      { text: "  first\n\tsecond", type: "text" },
    ])
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

function withReadOf(path: string, mtime: number, meta: Partial<FileMeta> = {}): Message<"tool"> {
  const part: ToolResultPart = {
    content: "",
    id: "1",
    meta: { kind: "read", mtime, path, ...meta },
    name: "read",
    type: "tool-result",
  }
  return { content: [part], id: "m1", role: "tool" }
}

describe("read tool — unchanged detection", () => {
  test("a full read of another file with identical mtime does not suppress content", async () => {
    const path = join(dir, "unread.txt")
    const other = join(dir, "already-read.txt")
    writeFileSync(path, "unread contents\n")
    writeFileSync(other, "other contents\n")
    const time = new Date("2026-01-01T00:00:00Z")
    utimesSync(path, time, time)
    utimesSync(other, time, time)
    const mtime = statSync(path).mtimeMs
    expect(statSync(other).mtimeMs).toBe(mtime)
    const ctx: ToolContext<ReadToolMeta> = {
      messages: [withReadOf(other, mtime, { full: true })],
    }

    const params = await readTool.validator.validateParams({ path })
    expect(await readTool.call(params, ctx)).toEqual([
      { content: "showing 1-1 of 1", tag: "slice", type: "meta" },
      { text: "unread contents", type: "text" },
    ])
    expect(ctx.meta?.unchanged).not.toBe(true)
  })

  test.each([
    { full: true, masked: false, stale: false, unchanged: true },
    { full: true, masked: true, stale: false, unchanged: false },
    { full: false, masked: false, stale: false, unchanged: false },
    { full: true, masked: false, stale: true, unchanged: false },
  ])(
    "unchanged requires a visible full read at the current mtime: %j",
    async ({ full, masked, stale, unchanged }) => {
      const path = join(dir, "unchanged.txt")
      writeFileSync(path, "current contents\n")
      const mtime = statSync(path).mtimeMs
      const ctx: ToolContext<ReadToolMeta> = {
        messages: [withReadOf(path, stale ? mtime - 1000 : mtime, { full })],
        isMasked: (id, part) => masked && id === "m1" && part === 0,
      }
      const params = await readTool.validator.validateParams({ path })
      const result = await readTool.call(params, ctx)
      if (unchanged) {
        expect(result).toEqual([
          { content: `file unchanged since last read: ${path}`, tag: "unchanged", type: "meta" },
        ])
        expect(ctx.meta?.unchanged).toBe(true)
      } else {
        expect(result).toEqual([
          { content: "showing 1-1 of 1", tag: "slice", type: "meta" },
          { text: "current contents", type: "text" },
        ])
        expect(ctx.meta?.unchanged).not.toBe(true)
      }
    }
  )

  test("a visible full read of another file cannot replace a masked matching read", async () => {
    const path = join(dir, "masked-read.txt")
    writeFileSync(path, "contents\n")
    const mtime = statSync(path).mtimeMs
    const ctx: ToolContext<ReadToolMeta> = {
      messages: [
        { ...withReadOf(path, mtime, { full: true }), id: "masked" },
        { ...withReadOf(join(dir, "other.txt"), mtime, { full: true }), id: "visible" },
      ],
      isMasked: (id, part) => id === "masked" && part === 0,
    }
    const params = await readTool.validator.validateParams({ path })
    expect(await readTool.call(params, ctx)).toEqual([
      { content: "showing 1-1 of 1", tag: "slice", type: "meta" },
      { text: "contents", type: "text" },
    ])
    expect(ctx.meta?.unchanged).not.toBe(true)
  })

  test.each([false, true])(
    "an old unchanged result does not replace its supporting full read (masked=%s)",
    async (masked) => {
      const path = join(dir, "unchanged-chain.txt")
      writeFileSync(path, "current contents\n")
      const mtime = statSync(path).mtimeMs
      const ctx: ToolContext<ReadToolMeta> = {
        messages: [
          { ...withReadOf(path, mtime, { full: true }), id: "original" },
          { ...withReadOf(path, mtime, { full: false, unchanged: true }), id: "unchanged" },
        ],
        isMasked: (id, part) => masked && id === "original" && part === 0,
      }
      const params = await readTool.validator.validateParams({ path })
      const result = await readTool.call(params, ctx)
      if (masked) {
        expect(result).toContainEqual({ type: "text", text: "current contents" })
        expect(ctx.meta?.unchanged).not.toBe(true)
      } else {
        expect(ctx.meta?.unchanged).toBe(true)
      }
    }
  )

  test("truncated lines are not recorded as a full-file read", async () => {
    const path = join(dir, "truncated-read.txt")
    writeFileSync(path, "x".repeat(3000))
    const ctx: ToolContext<ReadToolMeta> = {}
    const params = await readTool.validator.validateParams({ path })
    await readTool.call(params, ctx)
    expect(ctx.meta?.full).toBe(false)
    ctx.messages = [withReadOf(path, statSync(path).mtimeMs, { full: ctx.meta?.full })]
    await readTool.call(params, ctx)
    expect(ctx.meta?.unchanged).not.toBe(true)
  })

  test("relative requests match the same absolute path in metadata", async () => {
    const path = join(dir, "relative.txt")
    writeFileSync(path, "contents")
    const ctx: ToolContext<ReadToolMeta> = {
      cwd: dir,
      messages: [withReadOf(path, statSync(path).mtimeMs, { full: true })],
    }
    const params = await readTool.validator.validateParams({ path: "./relative.txt" })
    await readTool.call(params, ctx)
    expect(ctx.meta?.unchanged).toBe(true)
  })
})
