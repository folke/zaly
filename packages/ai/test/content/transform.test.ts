import { describe, expect, test } from "vitest"
import type {
  Attachment,
  ContentPart,
  ErrorPart,
  ImagePart,
  MetaPart,
  TextPart,
} from "../../src/types.ts"

import { ContentTransform } from "../../src/content/transform.ts"

const text = (s: string): TextPart => ({ text: s, type: "text" })
const meta = (data: unknown, tag = "meta"): MetaPart => ({ data, tag, type: "meta" })
const error = (code: Uppercase<string>, message = "boom"): ErrorPart => ({
  code,
  message,
  type: "error",
})
const image = (data = "AAA"): ImagePart => ({
  mime: "image/png",
  source: { data, type: "base64" },
  type: "image",
})

describe("ContentTransform — primitives", () => {
  test("empty pipeline passes content through unchanged", async () => {
    const ct = ContentTransform.create()
    const parts: ContentPart[] = [text("a"), image()]
    const out = await ct.run(parts)
    expect(out).toEqual(parts)
  })

  test("drop removes parts of the given kind", async () => {
    const ct = ContentTransform.create().drop("image")
    const out = await ct.run([text("hi"), image(), meta({ x: 1 })])
    expect(out.map((p) => p.type)).toEqual(["text", "meta"])
  })

  test("map replaces 1:1", async () => {
    const ct = ContentTransform.create().map("text", (t) => text(t.text.toUpperCase()))
    const out = await ct.run([text("hi"), text("yo"), image()])
    expect(out.map((p) => (p.type === "text" ? p.text : p.type))).toEqual(["HI", "YO", "image"])
  })

  test("map can return undefined to drop a single part", async () => {
    // Drop empty text parts; keep the rest.
    const ct = ContentTransform.create().map("text", (t) => (t.text === "" ? undefined : t))
    const out = await ct.run([text(""), text("keep"), text("")])
    expect(out.length).toBe(1)
    expect(out[0]).toEqual(text("keep"))
  })

  test("map can return an array (1:N) to expand a part", async () => {
    const ct = ContentTransform.create().map("text", (t) => [text(`<${t.text}>`), meta({ ref: t.text })])
    const out = await ct.run([text("hi")])
    expect(out.map((p) => p.type)).toEqual(["text", "meta"])
  })

  test("map widens the output type by R; type-level reachability", async () => {
    // Widening proof: error → meta replacement, output union excludes error.
    const ct = ContentTransform.create().map("error", (e) => meta(e, "error"))
    const out = await ct.run([text("hi"), error("BANG")])
    expect(out.map((p) => p.type)).toEqual(["text", "meta"])
    // No ErrorPart in the output array — verified at runtime AND type level.
    for (const p of out) {
      // @ts-expect-error — `error` is statically excluded after .map("error", …).
      void (p.type === "error")
    }
  })

  test("mapAsync awaits each call and runs sequentially", async () => {
    const order: string[] = []
    const wait = (ms: number, name: string): Promise<void> =>
      new Promise((r) =>
        setTimeout(() => {
          order.push(name)
          r()
        }, ms)
      )

    const ct = ContentTransform.create().mapAsync("text", async (t) => {
      // Earlier parts wait *longer* — if stages ran concurrently, the
      // recorded order would be reversed.
      await wait(t.text === "a" ? 30 : 5, t.text)
      return text(t.text.toUpperCase())
    })

    await ct.run([text("a"), text("b"), text("c")])
    expect(order).toEqual(["a", "b", "c"])
  })

  test("rewrite gets the whole array and can transform freely", async () => {
    // "merge adjacent text parts" is a classic rewrite use case.
    const ct = ContentTransform.create().rewrite((parts) => {
      const out: ContentPart[] = []
      for (const p of parts) {
        const last = out.at(-1)
        if (p.type === "text" && last?.type === "text") {
          out[out.length - 1] = text(`${last.text}${p.text}`)
        } else out.push(p)
      }
      return out
    })
    const out = await ct.run([text("a"), text("b"), image(), text("c"), text("d")])
    expect(out.map((p) => (p.type === "text" ? p.text : p.type))).toEqual(["ab", "image", "cd"])
  })

  test("extend appends every stage from another transform", async () => {
    const dropImage = ContentTransform.create().drop("image")
    const upper = ContentTransform.create().map("text", (t) => text(t.text.toUpperCase()))

    const ct = ContentTransform.create().extend(dropImage).extend(upper)
    const out = await ct.run([text("hi"), image(), text("yo")])
    expect(out.map((p) => (p.type === "text" ? p.text : p.type))).toEqual(["HI", "YO"])
  })

  test("chaining is immutable — earlier instances are not mutated", async () => {
    const base = ContentTransform.create()
    const dropping = base.drop("image")
    const parts: ContentPart[] = [text("a"), image()]

    // `base` should still pass content through unchanged.
    expect(await base.run(parts)).toEqual(parts)
    // `dropping` removes the image.
    expect(await dropping.run(parts)).toEqual([text("a")])
  })

  test("input array is not mutated by run", async () => {
    const ct = ContentTransform.create().drop("image")
    const parts: ContentPart[] = [text("a"), image(), text("b")]
    const snapshot = [...parts]
    await ct.run(parts)
    expect(parts).toEqual(snapshot)
  })

  test("stage order matters: each stage observes the previous one's output", async () => {
    // Map first, drop second: the upper-cased text is observed by the
    // drop, which removes it. (The ordering is verified by the absence
    // of "HI" in the output, not by the type-level chain.)
    const ct = ContentTransform.create()
      .map("text", (t) => text(t.text.toUpperCase()))
      .drop("text")
    expect(await ct.run([text("hi"), image()])).toEqual([image()])

    // Reverse order is rejected at compile time — `.drop("text")`
    // narrows the chain so that the next `.map("text", …)` would see
    // K extends `never` for "text". Correct: later stages can't
    // operate on kinds earlier stages already removed.
  })
})

describe("ContentTransform — type-level narrowing (compile-time)", () => {
  test("drop excludes the variant from the output type", async () => {
    const ct = ContentTransform.create().drop("image").drop("audio")
    const out = await ct.run([text("a"), meta({})] as ContentPart[])
    // After drop("image"|"audio"), `out[i].type` cannot statically be "image"/"audio".
    for (const p of out) {
      // @ts-expect-error — image was dropped.
      void (p.type === "image")
      // @ts-expect-error — audio was dropped.
      void (p.type === "audio")
    }
  })

  test("returning the same kind from map keeps it in the union", async () => {
    // map("text", → text) widens by `TextPart` and narrows by removing
    // "text" — net: text stays in the output type.
    const ct = ContentTransform.create().map("text", (t) => text(t.text))
    const out = await ct.run([text("hi"), image()])
    for (const p of out) {
      if (p.type === "text") void p.text // typed
    }
    expect(out.length).toBe(2)
  })
})

describe("ContentTransform — async ordering", () => {
  test("multiple async stages run in declared order; each completes before next starts", async () => {
    const events: string[] = []
    const ct = ContentTransform.create()
      .mapAsync("text", async (t) => {
        await new Promise((r) => setTimeout(r, 10))
        events.push(`stage1:${t.text}`)
        return t
      })
      .mapAsync("text", async (t) => {
        events.push(`stage2:${t.text}`)
        return t
      })

    await ct.run([text("a"), text("b")])
    // Stage 1 completes for both parts before stage 2 starts on either.
    expect(events).toEqual(["stage1:a", "stage1:b", "stage2:a", "stage2:b"])
  })
})

// Touch the imports the type narrowing tests reference — TS will error if
// unused. Plain runtime no-ops.
void ([] as Attachment[])
void ([] as MetaPart[])
