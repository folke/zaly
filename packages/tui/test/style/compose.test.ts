import type { Theme } from "../../src/themes/types.ts"

import { describe, expect, test } from "vitest"
import { reapplyStyle } from "../../src/style/ansi.ts"
import { openStyle, resolveStyle } from "../../src/style/style.ts"
import { defaultTheme } from "../../src/themes/index.ts"

describe("reapplyStyle", () => {
  const esc = "\x1b[48;2;255;0;0m"

  test("no resets: input unchanged", () => {
    expect(reapplyStyle("hello", esc)).toBe("hello")
  })

  test("single reset: style re-applied after", () => {
    expect(reapplyStyle("\x1b[38;2;0;0;255mhello\x1b[0mworld", esc)).toBe(
      `\x1b[38;2;0;0;255mhello\x1b[0m${esc}world`
    )
  })

  test("multiple resets: each gets style re-applied", () => {
    const input = "\x1b[0ma\x1b[0mb\x1b[0m"
    expect(reapplyStyle(input, esc)).toBe(`\x1b[0m${esc}a\x1b[0m${esc}b\x1b[0m${esc}`)
  })

  test("empty escape: input unchanged (guard)", () => {
    expect(reapplyStyle("\x1b[0mhello", "")).toBe("\x1b[0mhello")
  })
})

describe("resolveStyle", () => {
  test("inline Style object: returned as-is", () => {
    const s = { bold: true, fg: "primary" as const }
    expect(resolveStyle(s, defaultTheme)).toBe(s)
  })

  test("string ref → Color slot: wrapped as { fg }", () => {
    // moon.primary = "#82aaff" (a Color shortcut)
    expect(resolveStyle("primary", defaultTheme)).toEqual({ fg: "#82aaff" })
  })

  test("string ref → Style slot: returned directly", () => {
    const styleSlot = { bold: true, fg: "primary" as const, underline: true }
    const theme = { ...defaultTheme, mdHeading: styleSlot } as never
    expect(resolveStyle("mdHeading", theme)).toBe(styleSlot)
  })

  test("unknown string ref: treated as a fg color (resolved downstream)", () => {
    // Non-slot strings fall back to `{ fg: <ref> }` so callers like the
    // style builder can accept ANSI names (`"red"`), hex (`"#82aaff"`),
    // or anything else `colorParams` knows how to resolve.
    expect(resolveStyle("red", defaultTheme)).toEqual({ fg: "red" })
    expect(resolveStyle("#82aaff", defaultTheme)).toEqual({ fg: "#82aaff" })
  })

  test("undefined: returns empty style", () => {
    expect(resolveStyle(undefined, defaultTheme)).toEqual({})
  })

  test("no theme: still returns { fg } for any string ref", () => {
    expect(resolveStyle("red")).toEqual({ fg: "red" })
    expect(resolveStyle("primary")).toEqual({ fg: "primary" })
  })
})

describe("resolveColor — chained slots with `-step` / `/alpha` suffixes", () => {
  // Themes can reference each other through aliases, and a slot's value
  // is allowed to carry a `-step` or `/alpha` suffix on the right-hand
  // side. The resolver should compose these along the chain so that, e.g.
  // `b: "a-200"` followed by `a: "primary-100"` ultimately resolves to a
  // hex variant of `primary` with both -100 and -200 applied (or the
  // equivalent semantics — the key point is that no link in the chain
  // gets *silently* dropped).
  //
  // Currently each step in the chain is treated as a literal slot name
  // (so the `-step`/`/alpha` portion never gets parsed past the first
  // hop), which causes `openStyle` to emit no SGR for the fg. These
  // tests pin the expected post-fix behaviour.

  function withChain(extra: Record<string, unknown>): Theme {
    return { ...defaultTheme, ...extra } as Theme
  }

  test("slot chain ending in `-step` resolves through to a hex variant", () => {
    // a → "primary-100": a slot whose value is a step-suffixed reference
    // to another slot. Direct call site `fg: "a"` should behave the same
    // as if the user wrote `fg: "primary-100"`.
    const theme = withChain({ a: "primary-100" })
    const direct = openStyle({ fg: "primary-100" }, theme)
    const viaChain = openStyle({ fg: "a" as never }, theme)
    expect(viaChain).toBe(direct)
    // Sanity: direct path emits a truecolor SGR, not nothing.
    expect(direct).toMatch(/\x1b\[38;2;\d+;\d+;\d+m/)
  })

  test("multi-hop chain with nested `-step` suffixes composes", () => {
    // b → "a-200" → a → "primary-100" → primary (#82aaff). The two
    // -step suffixes should both apply (composed) and the final base
    // resolves through to a hex.
    const theme = withChain({ a: "primary-100", b: "a-200" })
    const out = openStyle({ fg: "b" as never }, theme)
    // Currently emits nothing — chain unfolds to "primary-100" verbatim,
    // which `ansiColor` can't parse, so the SGR run comes back empty.
    expect(out).toMatch(/\x1b\[38;2;\d+;\d+;\d+m/)
  })

  test("slot chain with `/alpha` suffix folds into the blend", () => {
    // c → "primary/30" should blend primary against `theme.blend` at
    // 30%, exactly as if the user had written `fg: "primary/30"` at the
    // call site.
    const theme = withChain({ c: "primary/30" })
    const direct = openStyle({ fg: "primary/30" }, theme)
    const viaChain = openStyle({ fg: "c" as never }, theme)
    expect(viaChain).toBe(direct)
  })
})
