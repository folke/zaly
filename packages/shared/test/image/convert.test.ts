import { describe, expect, test } from "vitest"
import type { ImageInfo } from "../../src/image/info.ts"
import { imageConvert } from "../../src/image/convert.ts"

const fakeImage = (format: ImageInfo["format"]): ImageInfo => ({
  data: Buffer.from([1, 2, 3]),
  format,
  height: 1,
  path: "/tmp/fake-source",
  type: "image",
  width: 1,
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
})
