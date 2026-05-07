import { describe, expect, test } from "vitest"
import { style } from "../../src/style/builder.ts"
import { defaultTheme } from "../../src/themes/index.ts"

describe("style() — ANSI fg", () => {
  test("plain red", () => {
    expect(style().red("hi")).toBe("\x1b[31mhi\x1b[0m")
  })

  test("bright variant", () => {
    expect(style().brightRed("hi")).toBe("\x1b[91mhi\x1b[0m")
  })

  test("gray alias → brightBlack", () => {
    expect(style().gray("hi")).toBe("\x1b[90mhi\x1b[0m")
  })
})

describe("style() — ANSI bg", () => {
  test("bg prefix", () => {
    expect(style().bgRed("hi")).toBe("\x1b[41mhi\x1b[0m")
  })

  test("bright bg", () => {
    expect(style().bgBrightBlue("hi")).toBe("\x1b[104mhi\x1b[0m")
  })
})

describe("style() — attributes", () => {
  test("bold", () => {
    expect(style().bold("hi")).toBe("\x1b[1mhi\x1b[0m")
  })

  test("italic + underline", () => {
    expect(style().italic.underline("hi")).toBe("\x1b[3;4mhi\x1b[0m")
  })
})

describe("style() — chaining", () => {
  test("fg + bg + attr", () => {
    expect(style().bold.red.bgBlue("hi")).toBe("\x1b[1;31;44mhi\x1b[0m")
  })

  test("last fg wins", () => {
    expect(style().red.blue("hi")).toBe("\x1b[34mhi\x1b[0m")
  })
})

describe("style() — theme slots", () => {
  test("theme fg slot resolves via theme", () => {
    expect(style(defaultTheme).primary("hi")).toBe("\x1b[38;2;130;170;255mhi\x1b[0m")
  })

  test("theme bg slot via bgPrefix", () => {
    expect(style(defaultTheme).bgPrimary("hi")).toBe("\x1b[48;2;130;170;255mhi\x1b[0m")
  })

  test("default theme is used when no argument is passed", () => {
    // tokyonight-moon is the shipped default; its `primary` is `#82aaff`.
    expect(style().primary("hi")).toBe("\x1b[38;2;130;170;255mhi\x1b[0m")
  })
})

describe("style() — escape-hatch methods", () => {
  test(".fg() accepts hex", () => {
    expect(style().fg("#82aaff")("hi")).toBe("\x1b[38;2;130;170;255mhi\x1b[0m")
  })

  test(".bg() accepts hex", () => {
    expect(style().bg("#82aaff")("hi")).toBe("\x1b[48;2;130;170;255mhi\x1b[0m")
  })

  test(".fg() + chain", () => {
    expect(style().fg("#ff0000").bold("hi")).toBe("\x1b[1;38;2;255;0;0mhi\x1b[0m")
  })

  test(".fg('inherit') drops silently", () => {
    expect(style().fg("inherit")("hi")).toBe("hi")
  })
})

describe("style() — no-op", () => {
  test("no chain: text passes through without escapes", () => {
    expect(style()("hi")).toBe("hi")
  })
})

describe("style() — composition", () => {
  test("reusing an intermediate builder", () => {
    const red = style().red
    expect(red("a")).toBe("\x1b[31ma\x1b[0m")
    expect(red.bold("b")).toBe("\x1b[1;31mb\x1b[0m")
    // Intermediate is not mutated by chaining off it.
    expect(red("c")).toBe("\x1b[31mc\x1b[0m")
  })
})

describe("style() — Style-valued theme slots", () => {
  test("Style slot applies attrs from the slot definition", () => {
    // mdBold default = { bold: true } → just the bold attr, no themed fg.
    // (Coverage for attrs + fg together is in the borderTitle test below.)
    expect(style(defaultTheme).mdBold("hi")).toBe("\x1b[1mhi\x1b[0m")
  })

  test("Style slot with attrs + fg together", () => {
    // moon.borderTitle = { bold: true, fg: "#589ed7" } in the current theme.
    expect(style(defaultTheme).borderTitle("T")).toBe("\x1b[1;38;2;88;158;215mT\x1b[0m")
  })

  test("chained attrs before Style slot are preserved when slot doesn't conflict", () => {
    // .underline then .mdBold → bold + underline (mdBold contributes only the
    // bold attr; no fg in its slot definition).
    expect(style(defaultTheme).underline.mdBold("x")).toBe("\x1b[1;4mx\x1b[0m")
  })

  test("later chain overrides slot values", () => {
    // Slot sets fg=primary; subsequent .red overrides.
    expect(style(defaultTheme).borderTitle.red("x")).toBe("\x1b[1;31mx\x1b[0m")
  })
})

// Pull RGB out of a truecolor SGR run for comparisons in the lightness
// tests below.
function rgb(out: string, kind: 38 | 48 = 38): [number, number, number] {
  const m = new RegExp(`\\x1b\\[(?:[^m]*;)*${kind};2;(\\d+);(\\d+);(\\d+)m`).exec(out)!
  return [Number(m[1]), Number(m[2]), Number(m[3])]
}

describe("style() — lightness modifier (+N / -N)", () => {
  // `<base>+N` / `<base>-N` shifts the resolved color's OKLCH lightness
  // by N percentage points. Predictable and theme-bg-independent.

  test("+N lightens vs the base slot", () => {
    const base = style(defaultTheme).primary("x")
    const lighter = style(defaultTheme).fg("primary+10")("x")
    expect(lighter).not.toBe(base)
    // Higher OKLCH L → higher per-channel sum (rough but reliable for
    // mid-saturation primary colors like tokyonight #82aaff).
    const baseSum = rgb(base).reduce((a, b) => a + b, 0)
    const lighterSum = rgb(lighter).reduce((a, b) => a + b, 0)
    expect(lighterSum).toBeGreaterThan(baseSum)
  })

  test("-N darkens vs the base slot", () => {
    const base = style(defaultTheme).primary("x")
    const darker = style(defaultTheme).fg("primary-10")("x")
    expect(darker).not.toBe(base)
    const baseSum = rgb(base).reduce((a, b) => a + b, 0)
    const darkerSum = rgb(darker).reduce((a, b) => a + b, 0)
    expect(darkerSum).toBeLessThan(baseSum)
  })

  test("works on the bg channel", () => {
    const base = style(defaultTheme).bgPrimary("x")
    const darker = style(defaultTheme).bg("primary-15")("x")
    expect(rgb(darker, 48).reduce((a, b) => a + b, 0)).toBeLessThan(
      rgb(base, 48).reduce((a, b) => a + b, 0)
    )
  })

  test("works on a hex literal directly (no slot lookup needed)", () => {
    const a = style().fg("#82aaff")("x")
    const b = style().fg("#82aaff+10")("x")
    expect(b).not.toBe(a)
    expect(rgb(b).reduce((s, v) => s + v, 0)).toBeGreaterThan(
      rgb(a).reduce((s, v) => s + v, 0)
    )
  })

  test("clamps at 0 and 1 — extreme shifts saturate to black/white", () => {
    const black = style().fg("#82aaff-100")("x")
    const white = style().fg("#82aaff+100")("x")
    const [r1, g1, b1] = rgb(black)
    expect(r1 + g1 + b1).toBeLessThan(30)
    const [r2, g2, b2] = rgb(white)
    expect(r2 + g2 + b2).toBeGreaterThan(720)
  })

  test("zero is a no-op (same as the base)", () => {
    expect(style(defaultTheme).fg("primary+0")("x")).toBe(
      style(defaultTheme).primary("x")
    )
  })

  test("chained slot ref carries the lightness modifier through", () => {
    // A theme that aliases another slot with a lightness shift; the
    // resolver should walk the chain and apply the shift at the leaf.
    const theme = { ...defaultTheme, accent: "primary+10" } as never
    const direct = style(theme).fg("primary+10")("x")
    const viaChain = style(theme).accent("x")
    expect(viaChain).toBe(direct)
  })
})

describe("style() — darken / lighten methods", () => {
  // `darken(n)` / `lighten(n)` shift the *last* set color (fg or bg)
  // by N OKLCH percentage points. Equivalent to using the `-N` / `+N`
  // suffix syntax — composes the same way through the resolver.

  test("darken(N) on fg matches the equivalent `-N` suffix", () => {
    const a = style(defaultTheme).primary.darken(10)("x")
    const b = style(defaultTheme).fg("primary-10")("x")
    expect(a).toBe(b)
  })

  test("lighten(N) on fg matches the equivalent `+N` suffix", () => {
    const a = style(defaultTheme).primary.lighten(10)("x")
    const b = style(defaultTheme).fg("primary+10")("x")
    expect(a).toBe(b)
  })

  test("darken(N) targets the bg when bg was the last channel set", () => {
    const a = style(defaultTheme).bgPrimary.darken(10)("x")
    const b = style(defaultTheme).bg("primary-10")("x")
    expect(a).toBe(b)
  })

  test("darken visibly darkens the rendered color", () => {
    const base = rgb(style(defaultTheme).primary("x"))
    const dark = rgb(style(defaultTheme).primary.darken(15)("x"))
    expect(dark.reduce((s, v) => s + v, 0)).toBeLessThan(base.reduce((s, v) => s + v, 0))
  })

  test("lighten visibly lightens the rendered color", () => {
    const base = rgb(style(defaultTheme).primary("x"))
    const light = rgb(style(defaultTheme).primary.lighten(15)("x"))
    expect(light.reduce((s, v) => s + v, 0)).toBeGreaterThan(
      base.reduce((s, v) => s + v, 0)
    )
  })

  test("darken(0) is a no-op", () => {
    expect(style(defaultTheme).primary.darken(0)("x")).toBe(
      style(defaultTheme).primary("x")
    )
  })

  test("lighten(0) is a no-op", () => {
    expect(style(defaultTheme).primary.lighten(0)("x")).toBe(
      style(defaultTheme).primary("x")
    )
  })

  test("repeated calls replace the previous shift (do not stack)", () => {
    // The existing modifier is stripped before the new one is applied,
    // so .darken(10).darken(5) ends with the slot at `-5`, not `-15`.
    const a = style(defaultTheme).primary.darken(5)("x")
    const b = style(defaultTheme).primary.darken(10).darken(5)("x")
    expect(b).toBe(a)
  })

  test("lighten then darken on the same color: final wins", () => {
    const a = style(defaultTheme).primary.darken(10)("x")
    const b = style(defaultTheme).primary.lighten(20).darken(10)("x")
    expect(b).toBe(a)
  })

  test("darken with no color set is a no-op (passthrough)", () => {
    expect(style(defaultTheme).darken(10)("hello")).toBe("hello")
  })

  test("lighten with no color set is a no-op (passthrough)", () => {
    expect(style(defaultTheme).lighten(10)("hello")).toBe("hello")
  })

  test("works on a hex literal directly", () => {
    const a = style().fg("#82aaff").darken(10)("x")
    const b = style().fg("#82aaff-10")("x")
    expect(a).toBe(b)
  })
})

describe("style() — inner-reset survival", () => {
  test("inner RESET gets the outer style re-applied after it", () => {
    // Simulates a nested builder call inside an outer one:
    //   style().red("pre" + style().bold("x") + "post")
    const inner = style().bold("x")
    const outer = style().red(`pre${inner}post`)
    // "pre" gets fg:red, then inner "[1mx[0m" — after that [0m, the outer
    // [31m must be re-applied so "post" is also red.
    expect(outer).toBe(`\x1b[31mpre\x1b[1mx\x1b[0m\x1b[31mpost\x1b[0m`)
  })
})

