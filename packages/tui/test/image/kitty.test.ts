import { describe, expect, test } from "vitest"
import {
  allocateImageId,
  allocatePlacementId,
  deleteAllImages,
  deleteImage,
  deletePlacement,
  placement,
  transmitBytes,
  transmitFile,
} from "../../src/image/kitty.ts"

describe("transmitFile", () => {
  test("emits t=f with the path base64-encoded in the payload", () => {
    const seq = transmitFile(7, "/abs/path/to/file.png")
    expect(seq.startsWith("\x1b_Ga=t,f=100,t=f,i=7,q=2;")).toBe(true)
    expect(seq.endsWith("\x1b\\")).toBe(true)
    // Payload should be the base64 of the path (ASCII: "/abs/path/to/file.png").
    const payload = seq.slice("\x1b_Ga=t,f=100,t=f,i=7,q=2;".length, -2)
    expect(Buffer.from(payload, "base64").toString()).toBe("/abs/path/to/file.png")
  })
})

describe("transmitBytes (remote fallback)", () => {
  test("small payload fits in a single chunk", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47])
    const seq = transmitBytes(7, png)
    expect(seq.startsWith("\x1b_Ga=t,f=100,i=7,q=2;")).toBe(true)
    expect(seq.endsWith("\x1b\\")).toBe(true)
    expect(seq).not.toContain("m=")
  })

  test("large payload is split into 4KB chunks with m=1/m=0 markers", () => {
    const png = new Uint8Array(6000).fill(0x42)
    const seq = transmitBytes(99, png)
    expect(seq.indexOf("\x1b_Ga=t,f=100,i=99,q=2,m=1;")).toBe(0)
    expect(seq).toContain("\x1b_Gm=0;")
    const chunkCount = seq.split("\x1b_G").length - 1
    expect(chunkCount).toBeGreaterThanOrEqual(2)
  })
})

describe("placement", () => {
  test("emits a=p with image id, placement id, c/r and C=1 (no cursor movement)", () => {
    // C=1 keeps the cursor from moving past the image, so the caller can
    // keep filling subsequent text rows normally.
    expect(placement(42, 7, { cols: 40, rows: 12 })).toBe(
      "\x1b_Ga=p,i=42,p=7,c=40,r=12,C=1,q=2\x1b\\"
    )
  })
})

describe("id allocators", () => {
  test("allocateImageId returns positive 32-bit integers", () => {
    for (let i = 0; i < 100; i++) {
      const id = allocateImageId()
      expect(id).toBeGreaterThanOrEqual(1)
      expect(id).toBeLessThanOrEqual(0xff_ff_ff_fe)
      expect(Number.isInteger(id)).toBe(true)
    }
  })

  test("allocatePlacementId returns positive 32-bit integers", () => {
    for (let i = 0; i < 100; i++) {
      const id = allocatePlacementId()
      expect(id).toBeGreaterThanOrEqual(1)
      expect(id).toBeLessThanOrEqual(0xff_ff_ff_fe)
    }
  })
})

describe("delete helpers", () => {
  test("deleteImage targets a specific image id and frees data", () => {
    expect(deleteImage(42)).toBe("\x1b_Ga=d,d=I,i=42,q=2\x1b\\")
  })

  test("deletePlacement targets an (image, placement) pair", () => {
    expect(deletePlacement(42, 7)).toBe("\x1b_Ga=d,d=i,i=42,p=7,q=2\x1b\\")
  })

  test("deleteAllImages deletes every visible placement", () => {
    expect(deleteAllImages()).toBe("\x1b_Ga=d,d=A,q=2\x1b\\")
  })
})
