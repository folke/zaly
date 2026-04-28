import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "pathe"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { imageDetect, imageHash, isImageFormat } from "../../src/image/detect.ts"

// Smallest possible PNG signature + IHDR for a 1×1 image. Enough for
// magic-byte sniffing; image-meta can also parse it.
const PNG_1x1 = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082",
  "hex"
)

const JPEG_HEADER = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0])
const GIF_HEADER = Buffer.from("GIF89a")
const WEBP_HEADER = Buffer.concat([Buffer.from("RIFF"), Buffer.from([0, 0, 0, 0]), Buffer.from("WEBP")])
const SVG_TEXT = Buffer.from('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"/>')

let dir: string
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "zaly-img-"))
})
afterAll(() => {
  rmSync(dir, { force: true, recursive: true })
})

const writeTmp = (name: string, data: Buffer): string => {
  const p = join(dir, name)
  writeFileSync(p, data)
  return p
}

describe("isImageFormat", () => {
  test("known formats", () => {
    expect(isImageFormat("png")).toBe(true)
    expect(isImageFormat("webp")).toBe(true)
  })
  test("unknown / undefined", () => {
    expect(isImageFormat("zzz")).toBe(false)
    expect(isImageFormat()).toBe(false)
  })
})

describe("imageDetect — magic bytes", () => {
  test("PNG", async () => {
    const p = writeTmp("a.bin", PNG_1x1)
    const r = await imageDetect(p)
    expect(r?.format).toBe("png")
    expect(r?.path).toBe(p)
  })
  test("JPEG", async () => {
    const p = writeTmp("b.bin", JPEG_HEADER)
    const r = await imageDetect(p)
    expect(r?.format).toBe("jpeg")
  })
  test("GIF", async () => {
    const p = writeTmp("c.bin", GIF_HEADER)
    const r = await imageDetect(p)
    expect(r?.format).toBe("gif")
  })
  test("WebP (RIFF + WEBP at offset 8)", async () => {
    const p = writeTmp("d.bin", WEBP_HEADER)
    const r = await imageDetect(p)
    expect(r?.format).toBe("webp")
  })
  test("SVG by text sniffing", async () => {
    const p = writeTmp("e.bin", SVG_TEXT)
    const r = await imageDetect(p)
    expect(r?.format).toBe("svg")
  })
})

describe("imageDetect — extension fallback", () => {
  test("known unsniffable extension (tga)", async () => {
    const p = writeTmp("x.tga", Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]))
    const r = await imageDetect(p)
    expect(r?.format).toBe("tga")
  })
  test("aliased extension maps to canonical format (targa → tga)", async () => {
    // tga has no magic-byte signature, so extension dispatch is allowed.
    const p = writeTmp("x.targa", Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]))
    const r = await imageDetect(p)
    expect(r?.format).toBe("tga")
  })
  test("magic-format extension with bad bytes is rejected", async () => {
    // Extension says png but bytes don't match — should refuse rather
    // than hand bad data downstream.
    const p = writeTmp("x.png", Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]))
    expect(await imageDetect(p)).toBeUndefined()
  })
  test("unknown extension returns undefined", async () => {
    const p = writeTmp("x.xyz", Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]))
    expect(await imageDetect(p)).toBeUndefined()
  })
})

describe("imageDetect — base64 data URI", () => {
  test("PNG base64 detected via magic bytes", async () => {
    const r = await imageDetect(`data:image/png;base64,${PNG_1x1.toString("base64")}`)
    expect(r?.format).toBe("png")
    expect(r?.path).toBeUndefined()
  })
  test("falls back to mime when bytes don't match a known signature", async () => {
    const r = await imageDetect(`data:image/webp;base64,${Buffer.from([1, 2, 3]).toString("base64")}`)
    expect(r?.format).toBe("webp")
  })
  test("unsupported mime returns undefined", async () => {
    const r = await imageDetect(`data:image/totally-fake;base64,${Buffer.from([1, 2, 3]).toString("base64")}`)
    expect(r).toBeUndefined()
  })
})

describe("imageDetect — missing file", () => {
  test("returns undefined", async () => {
    expect(await imageDetect(join(dir, "no-such-file"))).toBeUndefined()
  })
})

describe("imageHash", () => {
  test("returns a 16-char hex prefix and is memoised", () => {
    const img = { data: PNG_1x1, format: "png" as const }
    const a = imageHash(img)
    expect(a).toMatch(/^[0-9a-f]{16}$/)
    expect(imageHash(img)).toBe(a)
  })
  test("differs with content", () => {
    const a = imageHash({ data: PNG_1x1, format: "png" })
    const b = imageHash({ data: JPEG_HEADER, format: "jpeg" })
    expect(a).not.toBe(b)
  })
})
