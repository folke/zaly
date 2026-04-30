import type { ContentPart, MetaPart, TextPart } from "../../src/types.ts"

import { describe, expect, test } from "vitest"
import {
  hasAttachments,
  stringifyContent,
  toContent,
  toXml,
  transformMeta,
} from "../../src/content/format.ts"

const text = (t: string): TextPart => ({ text: t, type: "text" })
const meta = (data: unknown, tag?: string): MetaPart => ({ data, tag, type: "meta" })

describe("toContent", () => {
  test("string passthrough", () => {
    expect(toContent("hello")).toBe("hello")
    expect(toContent("")).toBe("")
  })

  test("undefined → empty string", () => {
    expect(toContent(undefined)).toBe("")
  })

  test("single ContentPart wrapped in array", () => {
    const part = text("hi")
    expect(toContent(part)).toEqual([part])
  })

  test("array of ContentParts passes through", () => {
    const parts = [text("a"), meta({ ok: true }, "ack")]
    expect(toContent(parts)).toEqual(parts)
  })

  test("non-part values JSON-stringified into a TextPart", () => {
    const result = toContent({ a: 1, b: 2 })
    expect(result).toEqual([{ format: "json", text: '{"a":1,"b":2}', type: "text" }])
  })

  test("array containing non-parts JSON-stringified, not treated as parts", () => {
    const result = toContent([1, 2, 3])
    expect(result).toEqual([{ format: "json", text: "[1,2,3]", type: "text" }])
  })

  test("empty array JSON-stringified, not treated as empty parts list", () => {
    // Empty array doesn't satisfy the "every isContentPart" guard (length > 0
    // requirement), so it falls through to JSON-stringify. Important so a
    // tool returning `[]` doesn't accidentally short-circuit to "no content"
    // — the model should see something explicit.
    const result = toContent([])
    expect(result).toEqual([{ format: "json", text: "[]", type: "text" }])
  })
})

describe("toXml", () => {
  test("wraps a string with the given tag", () => {
    expect(toXml("body", "shell")).toBe("<shell>body</shell>")
  })

  test("default tag is 'meta' when none given", () => {
    expect(toXml("body")).toBe("<meta>body</meta>")
  })

  test("strips invalid characters from tag, falls back to 'meta'", () => {
    expect(toXml("x", "tool meta")).toBe("<toolmeta>x</toolmeta>")
    expect(toXml("x", "!!!")).toBe("<meta>x</meta>")
    expect(toXml("x", "")).toBe("<meta>x</meta>")
  })

  test("trims whitespace from string body", () => {
    expect(toXml("   hello   ", "tag")).toBe("<tag>hello</tag>")
  })

  test("multi-line body gets newline padding inside the tag", () => {
    expect(toXml("a\nb", "tag")).toBe("<tag>\na\nb\n</tag>")
  })

  test("single-line body has no padding", () => {
    expect(toXml("hello", "tag")).toBe("<tag>hello</tag>")
  })

  test("object data is JSON-stringified", () => {
    expect(toXml({ ok: true }, "ack")).toBe('<ack>{"ok":true}</ack>')
  })

  test("nested single-line MetaPart stays compact (no padding)", () => {
    // Inner is single-line, so the outer body has no `\n` → no padding.
    const inner = meta("payload", "inner")
    expect(toXml(inner, "outer")).toBe("<outer><inner>payload</inner></outer>")
  })

  test("nested multi-line MetaPart pads at every level", () => {
    // The heartbeat case in production: inner data has its own newlines
    // (JSON-per-line for tasks). Every multi-line body triggers padding,
    // so each tag gets its content on its own line(s).
    const inner = meta("a\nb", "inner")
    expect(toXml(inner, "outer")).toBe("<outer>\n<inner>\na\nb\n</inner>\n</outer>")
  })

  test("array of MetaParts joined with newlines, then wrapped (multi-line body → padded)", () => {
    const children: MetaPart[] = [meta("a", "first"), meta("b", "second")]
    expect(toXml(children, "wrap")).toBe(
      "<wrap>\n<first>a</first>\n<second>b</second>\n</wrap>"
    )
  })
})

describe("stringifyContent", () => {
  test("string passthrough", () => {
    expect(stringifyContent("hello")).toBe("hello")
  })

  test("single ContentPart serialized as if in a one-element array", () => {
    expect(stringifyContent(text("hi"))).toBe("hi")
    expect(stringifyContent(meta("payload", "ack"))).toBe("<ack>payload</ack>")
  })

  test("array of TextParts joined with newlines", () => {
    expect(stringifyContent([text("a"), text("b"), text("c")])).toBe("a\nb\nc")
  })

  test("MetaParts inline as XML tags between text parts", () => {
    const out = stringifyContent([
      text("before"),
      meta({ status: "running" }, "shell"),
      text("after"),
    ])
    expect(out).toBe('before\n<shell>{"status":"running"}</shell>\nafter')
  })

  test("attachments rendered as bracketed type placeholders", () => {
    const out = stringifyContent([
      text("see attached"),
      { mime: "image/png", source: { data: "abc", type: "base64" }, type: "image" },
    ])
    expect(out).toBe("see attached\n[image]")
  })
})

describe("transformMeta", () => {
  test("string passthrough — returned identity", () => {
    expect(transformMeta("hello")).toBe("hello")
  })

  test("converts MetaParts to TextParts (XML-tagged), preserves order and length", () => {
    const input: ContentPart[] = [
      text("a"),
      meta({ x: 1 }, "shell"),
      text("b"),
      meta("note", "system"),
    ]
    const out = transformMeta(input)
    expect(out).toHaveLength(4)
    expect(out[0]).toEqual(text("a"))
    expect(out[1]).toEqual({ text: '<shell>{"x":1}</shell>', type: "text" })
    expect(out[2]).toEqual(text("b"))
    expect(out[3]).toEqual({ text: "<system>note</system>", type: "text" })
  })

  test("non-meta non-text parts pass through unchanged", () => {
    const image = {
      mime: "image/png" as const,
      source: { data: "abc", type: "base64" as const },
      type: "image" as const,
    }
    const out = transformMeta([text("look"), image])
    expect(out[0]).toEqual(text("look"))
    expect(out[1]).toBe(image) // same reference, not transformed
  })

  test("empty array returns empty array", () => {
    expect(transformMeta([])).toEqual([])
  })
})

describe("hasAttachments", () => {
  test("string content has no attachments", () => {
    expect(hasAttachments("hello")).toBe(false)
  })

  test("text-only content has no attachments", () => {
    expect(hasAttachments([text("a"), text("b")])).toBe(false)
  })

  test("text + meta still has no attachments — meta isn't an attachment", () => {
    expect(hasAttachments([text("a"), meta("ok", "ack")])).toBe(false)
  })

  test("any image / pdf / audio / video part counts as attachment", () => {
    const image = {
      mime: "image/png" as const,
      source: { data: "abc", type: "base64" as const },
      type: "image" as const,
    }
    expect(hasAttachments([text("see"), image])).toBe(true)
  })

  test("empty array has no attachments", () => {
    expect(hasAttachments([])).toBe(false)
  })
})
