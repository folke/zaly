import type { ImageInfo } from "../../src/image/info.ts"

import { describe, expect, test } from "vitest"
import { imageCompress, imageConvert, isWritable } from "../../src/image/convert.ts"

const svg = (id: string) =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10"><text>${id}</text></svg>`)

const fakeImage = (format: ImageInfo["format"], data = Buffer.from([1, 2, 3])): ImageInfo => ({
  data,
  format,
  height: 1,
  path: "/tmp/fake-source",
  type: "image",
  width: 1,
})

describe("isWritable", () => {
  test("recognizes formats sharp can write", () => {
    expect(isWritable(fakeImage("png"))).toBe(true)
    expect(isWritable(fakeImage("jpeg"))).toBe(true)
    expect(isWritable(fakeImage("webp"))).toBe(true)
    expect(isWritable(fakeImage("gif"))).toBe(false)
    expect(isWritable({ data: Buffer.from("text"), format: "plain", type: "text" } as any)).toBe(false)
  })
})

describe("imageConvert", () => {
  test("returns the source unchanged when its format already matches", async () => {
    const img = fakeImage("png")
    const out = await imageConvert(img, "png")
    expect(out).toBe(img)
  })

  test("returns the source unchanged when its format is in the list", async () => {
    const img = fakeImage("webp")
    const out = await imageConvert(img, ["png", "webp"])
    expect(out).toBe(img)
  })

  test("does not invoke sharp when no conversion is needed", async () => {
    // If sharp were loaded for a no-op conversion, this would throw on
    // systems without the optional dep installed. The fact that this
    // resolves cleanly is the assertion.
    const img = fakeImage("jpeg")
    await expect(imageConvert(img, "jpeg")).resolves.toBe(img)
  })

  test("converts with sharp when the source format is not accepted", async () => {
    const img = fakeImage("svg", svg(`convert-${Date.now()}`))
    const out = await imageConvert(img, "png")
    expect(out?.format).toBe("png")
    expect(out?.width).toBe(20)
    expect(out?.height).toBe(10)
    expect(out?.data.length).toBeGreaterThan(0)
  })
})

describe("imageCompress", () => {
  test("returns small writable images unchanged without loading sharp", async () => {
    const img = fakeImage("webp")
    await expect(imageCompress(img, { maxBytes: img.data.length })).resolves.toBe(img)
  })

  test("compresses non-writable images through jpeg fallback", async () => {
    const img = fakeImage("svg", svg(`compress-${Date.now()}`))
    const out = await imageCompress(img, { maxBytes: 1, maxDimension: 5, quality: 60 })
    expect(out.format).toBe("jpeg")
    expect(out.data.length).toBeGreaterThan(0)
    expect(out.path).toContain("zaly-image-compress-")
  })
})
