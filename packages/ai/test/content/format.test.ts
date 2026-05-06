import type { ContentPart, MetaPart, TextPart } from "../../src/types.ts"

import { describe, expect, test } from "vitest"
import {
  hasAttachments,
  renderMetaPart,
  stringifyContent,
  toContent,
  toXml,
  transformMeta,
} from "../../src/content/format.ts"

const text = (t: string): TextPart => ({ text: t, type: "text" })
const meta = (data: unknown, tag?: string): MetaPart => ({ data, tag, type: "meta" })
const metaWith = (content: ContentPart[], tag?: string): MetaPart => ({
  content,
  tag,
  type: "meta",
})

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

  test("multi-line body is indented with 2 spaces inside the tag", () => {
    expect(toXml("a\nb", "tag")).toBe("<tag>\n  a\n  b\n</tag>")
  })

  test("single-line body has no padding", () => {
    expect(toXml("hello", "tag")).toBe("<tag>hello</tag>")
  })

  test("object data is JSON-stringified", () => {
    expect(toXml({ ok: true }, "ack")).toBe('<ack>{"ok":true}</ack>')
  })

  test("does not recurse into objects that look like ContentParts", () => {
    // `toXml` is for raw data only — strict JSON. To wrap nested
    // Content, build a MetaPart with the `content` arm and render via
    // `renderMetaPart` / `stringifyContent`.
    const inner = meta("payload", "inner")
    expect(toXml(inner, "outer")).toBe(
      '<outer>{"data":"payload","tag":"inner","type":"meta"}</outer>'
    )
  })
})

describe("renderMetaPart", () => {
  test("data arm: object stringified as JSON inside the tag", () => {
    expect(renderMetaPart(meta({ ok: true }, "ack"))).toBe('<ack>{"ok":true}</ack>')
  })

  test("data arm: string used verbatim", () => {
    expect(renderMetaPart(meta("payload", "inner"))).toBe("<inner>payload</inner>")
  })

  test("content arm: nested single-line MetaPart stays compact", () => {
    // Inner is single-line, so the outer body has no `\n` → no padding.
    const inner = meta("payload", "inner")
    expect(renderMetaPart(metaWith([inner], "outer"))).toBe("<outer><inner>payload</inner></outer>")
  })

  test("content arm: nested multi-line MetaPart indents at every level", () => {
    // The heartbeat case in production: inner data has its own newlines
    // (JSON-per-line for tasks). Multi-line bodies get 2-space indent,
    // applied at each wrapping level.
    const inner = meta("a\nb", "inner")
    expect(renderMetaPart(metaWith([inner], "outer"))).toBe(
      "<outer>\n  <inner>\n    a\n    b\n  </inner>\n</outer>"
    )
  })

  test("content arm: array of MetaParts joined with newlines, then wrapped", () => {
    const children: MetaPart[] = [meta("a", "first"), meta("b", "second")]
    expect(renderMetaPart(metaWith(children, "wrap"))).toBe(
      "<wrap>\n  <first>a</first>\n  <second>b</second>\n</wrap>"
    )
  })

  test("content arm: text + meta children mix freely", () => {
    const children: ContentPart[] = [text("before"), meta("payload", "inner"), text("after")]
    expect(renderMetaPart(metaWith(children, "outer"))).toBe(
      "<outer>\n  before\n  <inner>payload</inner>\n  after\n</outer>"
    )
  })

  test("both arms: data renders inside the tag, before content body", () => {
    // The toErrorResult case: `data` carries the structured discriminator
    // (code, retryable, etc.) and `content` carries the human-readable body.
    // Both live inside the wrapping `<tag>` so the meta unit stays cohesive.
    const m: MetaPart = {
      content: [text("❌ BANG: boom")],
      data: { code: "BANG", retryable: true },
      tag: "error",
      type: "meta",
    }
    expect(renderMetaPart(m)).toBe(
      '<error>\n  {"code":"BANG","retryable":true}\n  ❌ BANG: boom\n</error>'
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

  test("attachments rendered as <kind> meta tags carrying mime/source ref", () => {
    // base64 sources omit the bytes (would balloon the prompt) but
    // surface mime; url/file sources also carry the reference. Routes
    // through the flatten pipeline (`fileToMetaPart` → `metaToText`).
    const out = stringifyContent([
      text("see attached"),
      { mime: "image/png", source: { data: "abc", type: "base64" }, type: "image" },
    ])
    expect(out).toBe('see attached\n<image>{"mime":"image/png"}</image>')
  })

  test("attachments with url/file source surface the reference", () => {
    const out = stringifyContent([
      { mime: "image/jpeg", source: { type: "url", url: "https://x/y.jpg" }, type: "image" },
      { mime: "application/pdf", source: { path: "/tmp/a.pdf", type: "file" }, type: "pdf" },
    ])
    expect(out).toBe(
      '<image>{"mime":"image/jpeg","url":"https://x/y.jpg"}</image>\n' +
        '<pdf>{"mime":"application/pdf","path":"/tmp/a.pdf"}</pdf>'
    )
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
