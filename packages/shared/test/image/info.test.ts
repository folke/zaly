import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "pathe"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { imageInfo } from "../../src/image/info.ts"

// Real 1×1 PNG — image-meta needs a valid IHDR to pull dimensions.
const PNG_1x1 = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082",
  "hex"
)

let dir: string
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "zaly-imginfo-"))
})
afterAll(() => {
  rmSync(dir, { force: true, recursive: true })
})

describe("imageInfo", () => {
  test("reads format and dimensions for a real PNG", async () => {
    const p = join(dir, "a.png")
    writeFileSync(p, PNG_1x1)
    const info = await imageInfo(p)
    expect(info?.format).toBe("png")
    expect(info?.width).toBe(1)
    expect(info?.height).toBe(1)
  })

  test("returns undefined for an undetectable source", async () => {
    expect(await imageInfo(join(dir, "missing"))).toBeUndefined()
  })

  test("throws on a detected-but-unparseable image", async () => {
    // PNG magic bytes only — no IHDR. detectFromBytes succeeds, but
    // image-meta can't pull dimensions (or rejects the malformed file).
    const p = join(dir, "b.png")
    writeFileSync(p, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    await expect(imageInfo(p)).rejects.toThrow()
  })
})
