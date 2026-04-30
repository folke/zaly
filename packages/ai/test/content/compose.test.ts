import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type {
  ContentPart,
  ErrorPart,
  ImagePart,
  MetaPart,
  PdfPart,
  TextPart,
} from "../../src/types.ts"

import {
  attachmentToMeta,
  dropAttachments,
  errorToMeta,
  inlineFileSources,
  metaToText,
} from "../../src/content/compose.ts"
import { ContentTransform } from "../../src/content/transform.ts"

const run = <T extends ContentPart>(
  step: (ct: ContentTransform) => ContentTransform<T>,
  parts: ContentPart[]
): Promise<T[]> => ContentTransform.create().pipe(step).run(parts)

const text = (s: string): TextPart => ({ text: s, type: "text" })
const meta = (data: unknown, tag = "meta"): MetaPart => ({ data, tag, type: "meta" })
const error = (over: Partial<ErrorPart> = {}): ErrorPart => ({
  code: "TEST",
  message: "oops",
  type: "error",
  ...over,
})
const imageBase64 = (data = "AAA"): ImagePart => ({
  mime: "image/png",
  source: { data, type: "base64" },
  type: "image",
})
const imageFile = (path: string): ImagePart => ({
  mime: "image/png",
  source: { path, type: "file" },
  type: "image",
})
const pdfFile = (path: string): PdfPart => ({
  mime: "application/pdf",
  source: { path, type: "file" },
  type: "pdf",
})

describe("dropAttachments", () => {
  test("removes image, pdf, audio, video", async () => {
    const out = await run(dropAttachments(), [
      text("hi"),
      imageBase64(),
      meta({ x: 1 }),
    ] as ContentPart[])
    expect(out.map((p) => p.type)).toEqual(["text", "meta"])
  })
})

describe("attachmentToMeta", () => {
  test("converts the named kinds to a per-kind tagged MetaPart with mime + ref, no bytes", async () => {
    const url: ImagePart = {
      mime: "image/jpeg",
      source: { type: "url", url: "https://example.com/cat.jpg" },
      type: "image",
    }
    const path = "/tmp/cat.png"
    const out = await run(attachmentToMeta("image", "audio"), [
      text("hi"),
      url,
      imageBase64("ZZZ"),
      imageFile(path),
    ])

    expect(out.length).toBe(4)
    expect(out[0]).toEqual(text("hi"))

    // url-source image → <image url=...> meta
    const m1 = out[1]
    expect(m1.type).toBe("meta")
    if (m1.type !== "meta") return
    expect(m1.tag).toBe("image")
    expect(m1.data).toEqual({ mime: "image/jpeg", url: "https://example.com/cat.jpg" })

    // base64-source image → <image mime="…"> with no source ref (bytes omitted)
    const m2 = out[2]
    expect(m2.type).toBe("meta")
    if (m2.type !== "meta") return
    expect(m2.tag).toBe("image")
    expect(m2.data).toEqual({ mime: "image/png" })

    // file-source image → <image path="…">
    const m3 = out[3]
    expect(m3.type).toBe("meta")
    if (m3.type !== "meta") return
    expect(m3.tag).toBe("image")
    expect(m3.data).toEqual({ mime: "image/png", path })
  })

  test("leaves unspecified kinds untouched", async () => {
    const out = await run(attachmentToMeta("image"), [imageBase64("AAA"), pdfFile("/tmp/x.pdf")])
    expect(out[0].type).toBe("meta") // image was converted
    expect(out[1].type).toBe("pdf") // pdf was not in the kinds list
  })
})

describe("errorToMeta", () => {
  test("replaces ErrorPart with a tagged MetaPart carrying data + content", async () => {
    const out = await run(errorToMeta(), [
      text("ok"),
      error({ code: "BANG", data: { foo: "bar" }, message: "boom", retryable: true }),
    ])
    expect(out.length).toBe(2)
    expect(out[0].type).toBe("text")

    const m = out[1]
    expect(m.type).toBe("meta")
    if (m.type !== "meta") return
    expect(m.tag).toBe("error")
    // `data` carries the structured discriminator (no `message` — the
    // body already shows it).
    expect(m.data).toEqual({
      code: "BANG",
      data: { foo: "bar" },
      retryable: true,
    })
    // `content` carries the human-readable formatted block (with
    // `retry: true` marker since the source error is retryable).
    expect(m.content).toEqual([{ text: "❌ BANG: boom\nretry: true", type: "text" }])
  })

  test("omits absent fields from the MetaPart payload", async () => {
    const out = await run(errorToMeta(), [error({ code: "X", message: "m" })])
    const m = out[0]
    if (m.type !== "meta") throw new Error("expected meta")
    // No data on source error and not retryable → omitted from the data payload.
    expect(m.data).toEqual({ code: "X", data: undefined, retryable: undefined })
  })
})

describe("metaToText", () => {
  test("replaces MetaPart with an XML-tagged TextPart", async () => {
    const out = await run(metaToText(), [text("a"), meta({ key: "value" }, "info"), text("b")])
    expect(out.length).toBe(3)
    expect(out[0]).toEqual(text("a"))
    const t = out[1]
    expect(t.type).toBe("text")
    if (t.type !== "text") return
    expect(t.text).toMatch(/^<info>/)
    expect(t.text).toContain("value")
    expect(t.text).toMatch(/<\/info>$/m)
    expect(out[2]).toEqual(text("b"))
  })
})

describe("inlineFileSources", () => {
  let dir: string
  beforeAll(() => {
    dir = mkdtempSync(`${tmpdir()}/zaly-inline-`)
  })
  afterAll(() => {
    rmSync(dir, { force: true, recursive: true })
  })

  test("converts file-source attachments to base64", async () => {
    const path = `${dir}/small.bin`
    writeFileSync(path, Buffer.from([0x01, 0x02, 0x03]))
    const out = await run(inlineFileSources(), [imageFile(path)])
    const img = out[0]
    expect(img.type).toBe("image")
    if (img.type !== "image") return
    expect(img.source.type).toBe("base64")
    if (img.source.type !== "base64") return
    expect(img.source.data).toBe(Buffer.from([0x01, 0x02, 0x03]).toString("base64"))
  })

  test("leaves base64-source attachments untouched", async () => {
    const original = imageBase64("ZZZZ")
    const out = await run(inlineFileSources(), [original])
    expect(out[0]).toEqual(original)
  })

  test("missing file → MetaPart marker preserves the path", async () => {
    const out = await run(inlineFileSources(), [pdfFile(`${dir}/no-such.pdf`)])
    const m = out[0]
    expect(m.type).toBe("meta")
    if (m.type !== "meta") return
    expect(m.tag).toBe("file")
    expect(m.data).toMatchObject({ error: "unreadable" })
  })

  test("non-attachment parts pass through unchanged", async () => {
    const out = await run(inlineFileSources(), [text("hi"), meta({ k: "v" })] as ContentPart[])
    expect(out).toEqual([text("hi"), meta({ k: "v" })])
  })
})
