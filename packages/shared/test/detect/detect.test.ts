// oxlint-disable unicorn/no-await-expression-member
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { pathToFileURL } from "node:url"
import { join } from "pathe"
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest"
import { fileData, fileHash, isBinaryData } from "../../src/detect/data.ts"
import { detect, fileDetect, isFileFormat, isFileType } from "../../src/detect/file.ts"
import { imageDetector } from "../../src/detect/image.ts"
import { detectTextFormat } from "../../src/detect/text.ts"

// Smallest possible PNG signature + IHDR for a 1×1 image. Enough for
// magic-byte sniffing; image-meta can also parse it.
const PNG_1x1 = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082",
  "hex"
)

const JPEG_HEADER = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0])
const GIF_HEADER = Buffer.from("GIF89a")
const WEBP_HEADER = Buffer.concat([
  Buffer.from("RIFF"),
  Buffer.from([0, 0, 0, 0]),
  Buffer.from("WEBP"),
])
const SVG_TEXT = Buffer.from('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"/>')
const PDF_HEADER = Buffer.from("%PDF-1.4\n")

let dir: string
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "zaly-detect-"))
})
afterAll(() => {
  rmSync(dir, { force: true, recursive: true })
})

const writeTmp = (name: string, data: Buffer): string => {
  const p = join(dir, name)
  writeFileSync(p, data)
  return p
}

describe("isFileType / isFileFormat", () => {
  test("isFileType narrows DetectedFile to the matching variant", async () => {
    const p = writeTmp("a.png", PNG_1x1)
    const r = await fileDetect(p)
    expect(r).toBeDefined()
    if (!r) return
    expect(isFileType(r, "image")).toBe(true)
    expect(isFileType(r, "pdf")).toBe(false)
    if (isFileType(r, "image")) {
      // Narrowed: `format` is now `ImageFormat`.
      expect(r.format).toBe("png")
    }
  })
  test("isFileFormat checks both type and format", async () => {
    const p = writeTmp("b.png", PNG_1x1)
    const r = await fileDetect(p)
    expect(r).toBeDefined()
    if (!r) return
    expect(isFileFormat(r, "image", "png")).toBe(true)
    expect(isFileFormat(r, "image", "jpeg")).toBe(false)
    expect(isFileFormat(r, "pdf", "pdf")).toBe(false)
    if (isFileFormat(r, "image", "png")) {
      // Narrowed to the literal format.
      expect(r.format).toBe("png")
    }
  })
})

describe("fileDetect — magic bytes", () => {
  test("PNG", async () => {
    const p = writeTmp("a.bin", PNG_1x1)
    const r = await fileDetect(p)
    expect(r?.type).toBe("image")
    if (r?.type === "image") {
      expect(r.format).toBe("png")
      expect(r.path).toBe(p)
    }
  })
  test("JPEG", async () => {
    const p = writeTmp("b.bin", JPEG_HEADER)
    const r = await fileDetect(p)
    expect(r?.type).toBe("image")
    if (r?.type === "image") expect(r.format).toBe("jpeg")
  })
  test("GIF", async () => {
    const p = writeTmp("c.bin", GIF_HEADER)
    const r = await fileDetect(p)
    expect(r?.type).toBe("image")
    if (r?.type === "image") expect(r.format).toBe("gif")
  })
  test("WebP (RIFF + WEBP at offset 8)", async () => {
    const p = writeTmp("d.bin", WEBP_HEADER)
    const r = await fileDetect(p)
    expect(r?.type).toBe("image")
    if (r?.type === "image") expect(r.format).toBe("webp")
  })
  test("SVG by text sniffing", async () => {
    const p = writeTmp("e.bin", SVG_TEXT)
    const r = await fileDetect(p)
    expect(r?.type).toBe("image")
    if (r?.type === "image") expect(r.format).toBe("svg")
  })
  test("AVIF and HEIC by ISOBMFF brand", async () => {
    const avif = writeTmp("avif.bin", Buffer.from("\0\0\0\0ftypavifxxxx", "binary"))
    const heic = writeTmp("heic.bin", Buffer.from("\0\0\0\0ftypheicxxxx", "binary"))
    expect((await fileDetect(avif))?.format).toBe("avif")
    expect((await fileDetect(heic))?.format).toBe("heic")
  })
  test("Netpbm variants by subtype byte", async () => {
    expect((await fileDetect(writeTmp("p1.bin", Buffer.from("P1\n"))))?.format).toBe("pbm")
    expect((await fileDetect(writeTmp("p2.bin", Buffer.from("P2\n"))))?.format).toBe("pgm")
    expect((await fileDetect(writeTmp("p3.bin", Buffer.from("P3\n"))))?.format).toBe("ppm")
    expect((await fileDetect(writeTmp("p7.bin", Buffer.from("P7\n"))))?.format).toBe("pam")
  })
  test("PDF", async () => {
    const p = writeTmp("doc.bin", PDF_HEADER)
    const r = await fileDetect(p)
    expect(r?.type).toBe("pdf")
    if (r?.type === "pdf") expect(r.format).toBe("pdf")
  })
})

describe("fileDetect — extension fallback", () => {
  test("known unsniffable extension (tga)", async () => {
    const p = writeTmp("x.tga", Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]))
    const r = await fileDetect(p)
    expect(r?.type).toBe("image")
    if (r?.type === "image") expect(r.format).toBe("tga")
  })
  test("aliased extension maps to canonical format (targa → tga)", async () => {
    const p = writeTmp("x.targa", Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]))
    const r = await fileDetect(p)
    expect(r?.type).toBe("image")
    if (r?.type === "image") expect(r.format).toBe("tga")
  })
  test("magic-format extension with bad bytes is NOT classified as that image", async () => {
    // Extension says png but bytes don't match — image detector refuses,
    // and the file falls through to text/binary classification.
    const p = writeTmp("x.png", Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]))
    const r = await fileDetect(p)
    expect(r?.type).not.toBe("image")
  })
})

describe("fileDetect — base64 data URI", () => {
  test("PNG base64 detected via magic bytes", async () => {
    const r = await fileDetect(`data:image/png;base64,${PNG_1x1.toString("base64")}`)
    expect(r?.type).toBe("image")
    if (r?.type === "image") {
      expect(r.format).toBe("png")
      expect(r.path).toBeUndefined()
    }
  })
  test("falls back to mime for non-magic image formats (TGA has no signature)", async () => {
    const r = await fileDetect(
      `data:image/x-tga;base64,${Buffer.from([1, 2, 3]).toString("base64")}`
    )
    expect(r?.type).toBe("image")
    if (r?.type === "image") expect(r.format).toBe("tga")
  })
  test("magic-detectable mime with bad bytes does not produce that image", async () => {
    // Strict rule: for formats covered by magic-byte detection, the
    // bytes are authoritative. The file falls through to text/binary.
    const r = await fileDetect(
      `data:image/webp;base64,${Buffer.from([1, 2, 3]).toString("base64")}`
    )
    expect(r?.type).not.toBe("image")
  })
})

describe("fileDetect — text classification", () => {
  test("plain ASCII is text/plain", async () => {
    const p = writeTmp("readme.txt", Buffer.from("hello world\nthis is a text file\n"))
    const r = await fileDetect(p)
    expect(r?.type).toBe("text")
    if (r?.type === "text") expect(r.format).toBe("plain")
  })
  test("JSON by extension", async () => {
    const p = writeTmp("data.json", Buffer.from('{"a":1}\n'))
    const r = await fileDetect(p)
    expect(r?.type).toBe("text")
    if (r?.type === "text") expect(r.format).toBe("json")
  })
  test("markdown by extension", async () => {
    const p = writeTmp("doc.md", Buffer.from("# Hi\n\nBody\n"))
    const r = await fileDetect(p)
    expect(r?.type).toBe("text")
    if (r?.type === "text") expect(r.format).toBe("markdown")
  })
  test("text with sporadic control bytes still classifies as text (under threshold)", async () => {
    // 1 control byte in 100 = 1% < 5% threshold.
    const data = Buffer.concat([Buffer.from("a".repeat(99)), Buffer.from([0x01])])
    const p = writeTmp("ansi.log", data)
    const r = await fileDetect(p)
    expect(r?.type).toBe("text")
  })
  test("binary content (mostly NUL/control) classifies as binary", async () => {
    const data = Buffer.alloc(100, 0x00) // all NUL bytes
    const p = writeTmp("blob.bin", data)
    const r = await fileDetect(p)
    expect(r?.type).toBe("binary")
  })
})

describe("fileDetect — missing file", () => {
  test("returns undefined", async () => {
    expect(await fileDetect(join(dir, "no-such-file"))).toBeUndefined()
  })
})

describe("detect — direct engine usage on FileData", () => {
  test("imageDetector returns format from already-fetched bytes", async () => {
    const p = writeTmp("inline.bin", PNG_1x1)
    const file = await fileData(p)
    expect(file).toBeDefined()
    const r = file && detect(imageDetector, file)
    expect(r?.type).toBe("image")
    expect(r?.format).toBe("png")
  })
})

describe("fileData", () => {
  test("reads file:// URLs and records the original URL", async () => {
    const p = writeTmp("url.txt", Buffer.from("hello"))
    const url = pathToFileURL(p).href
    const file = await fileData(url)
    expect(file?.path).toBe(p)
    expect(file?.url).toBe(url)
    expect(Buffer.from(file?.data ?? []).toString()).toBe("hello")
  })

  test("returns undefined for invalid file URLs", async () => {
    expect(await fileData("file://not a valid file url")).toBeUndefined()
  })

  test("fetches http URLs when no local data is available", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("hello", { headers: { "content-type": "text/plain" } }))
    try {
      const file = await fileData("https://example.com/file.txt")
      expect(fetch).toHaveBeenCalledOnce()
      expect(file?.mime).toBe("text/plain")
      expect(Buffer.from(file?.data ?? []).toString()).toBe("hello")
    } finally {
      fetch.mockRestore()
    }
  })

  test("returns undefined for failed http fetches", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("no", { status: 404 }))
    try {
      expect(await fileData("https://example.com/missing")).toBeUndefined()
    } finally {
      fetch.mockRestore()
    }
  })
})

describe("isBinaryData", () => {
  test("empty data and allowed whitespace controls are not binary", () => {
    expect(isBinaryData(new Uint8Array())).toBe(false)
    expect(isBinaryData(Buffer.from("\t\n\r"))).toBe(false)
  })

  test("DEL/control-byte ratio above threshold is binary", () => {
    expect(isBinaryData(Buffer.from([127, 127, 65, 66]), 0.25)).toBe(true)
  })
})

describe("detectTextFormat", () => {
  test("prefers MIME over path/content", () => {
    expect(detectTextFormat({ data: Buffer.from("{}"), mime: "text/csv", path: "x.json" })).toBe(
      "csv"
    )
  })

  test("detects common extensions and content peeks", () => {
    expect(detectTextFormat({ data: Buffer.from(""), path: "x.htm" })).toBe("html")
    expect(detectTextFormat({ data: Buffer.from(""), path: "x.svg" })).toBe("xml")
    expect(detectTextFormat({ data: Buffer.from(" <!DOCTYPE html>") })).toBe("html")
    expect(detectTextFormat({ data: Buffer.from(" [1,2]") })).toBe("json")
    expect(detectTextFormat({ data: Buffer.from(" plain") })).toBe("plain")
  })
})

describe("fileHash", () => {
  test("returns a 16-char hex prefix and is memoised", () => {
    const img = { data: PNG_1x1 }
    const a = fileHash(img)
    expect(a).toMatch(/^[0-9a-f]{16}$/)
    expect(fileHash(img)).toBe(a)
  })
  test("differs with content", () => {
    const a = fileHash({ data: PNG_1x1 })
    const b = fileHash({ data: JPEG_HEADER })
    expect(a).not.toBe(b)
  })
})
