import type { DetectedFile, DetectedImage } from "@zaly/shared/detect"
import type { ImagePart, PdfPart } from "../../src/types.ts"

import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, test } from "vitest"
import { AiError } from "../../src/error.ts"
import { inlineFile, toAttachment, toErrorPart, toImagePart, toPdfPart } from "../../src/content/part.ts"

let dirs: string[] = []
afterEach(() => {
  for (const dir of dirs) rmSync(dir, { force: true, recursive: true })
  dirs = []
})

const tmp = () => {
  const dir = mkdtempSync(join(tmpdir(), "zaly-ai-part-"))
  dirs.push(dir)
  return dir
}

describe("content part constructors", () => {
  test("toErrorPart normalizes AiError fields", () => {
    const part = toErrorPart(
      new AiError({ code: "NOPE", data: { id: 1 }, message: "nope", retryable: true })
    )
    expect(part).toEqual({
      code: "NOPE",
      data: { id: 1 },
      message: "nope",
      retryable: true,
      type: "error",
    })
  })

  test("toErrorPart wraps plain errors", () => {
    expect(toErrorPart(new Error("boom"))).toMatchObject({ code: "ERROR", message: "boom" })
  })

  test("toImagePart encodes image bytes and mime by format", () => {
    const png: DetectedImage<"png"> = {
      data: Buffer.from("png-bytes"),
      format: "png",
      type: "image",
    }
    expect(toImagePart(png)).toEqual({
      mime: "image/png",
      source: { data: Buffer.from("png-bytes").toString("base64"), type: "base64" },
      type: "image",
    })

    const jpeg: DetectedImage<"jpeg"> = { ...png, format: "jpeg" }
    expect(toImagePart(jpeg).mime).toBe("image/jpeg")
    const webp: DetectedImage<"webp"> = { ...png, format: "webp" }
    expect(toImagePart(webp).mime).toBe("image/webp")
  })

  test("toPdfPart encodes PDF bytes", () => {
    expect(toPdfPart(Buffer.from("pdf"))).toEqual({
      mime: "application/pdf",
      source: { data: Buffer.from("pdf").toString("base64"), type: "base64" },
      type: "pdf",
    })
  })
})

describe("toAttachment", () => {
  test("returns undefined for text and binary files", async () => {
    const text: DetectedFile = { data: Buffer.from("hi"), format: "plain", type: "text" }
    const binary: DetectedFile = { data: Buffer.from([0]), format: "unknown", type: "binary" }
    await expect(toAttachment(text)).resolves.toBeUndefined()
    await expect(toAttachment(binary)).resolves.toBeUndefined()
  })

  test("converts PDF files to pdf attachments", async () => {
    const pdf: DetectedFile = { data: Buffer.from("pdf"), format: "pdf", type: "pdf" }
    await expect(toAttachment(pdf)).resolves.toEqual(toPdfPart(Buffer.from("pdf")))
  })

  test("returns already-supported image attachments", async () => {
    const image: DetectedImage<"png"> = { data: Buffer.from("img"), format: "png", type: "image" }
    await expect(toAttachment(image)).resolves.toEqual(toImagePart(image))
  })
})

describe("inlineFile", () => {
  test("passes through non-file sources", async () => {
    const part: ImagePart = {
      mime: "image/png",
      source: { data: "abc", type: "base64" },
      type: "image",
    }
    await expect(inlineFile(part)).resolves.toBe(part)
  })

  test("inlines readable file sources", async () => {
    const dir = tmp()
    const path = join(dir, "a.pdf")
    writeFileSync(path, "hello")
    const part: PdfPart = {
      mime: "application/pdf",
      source: { path, type: "file" },
      type: "pdf",
    }

    await expect(inlineFile(part)).resolves.toEqual({
      ...part,
      source: { data: Buffer.from("hello").toString("base64"), type: "base64" },
    })
  })

  test("returns file meta part for unreadable file sources", async () => {
    const path = join(tmp(), "missing.pdf")
    const part: PdfPart = {
      mime: "application/pdf",
      source: { path, type: "file" },
      type: "pdf",
    }

    await expect(inlineFile(part)).resolves.toEqual({
      data: { error: "unreadable", path },
      tag: "file",
      type: "meta",
    })
  })
})
