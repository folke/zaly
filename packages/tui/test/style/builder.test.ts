import { describe, expect, test } from "vitest"
import { style } from "../../src/style/builder.ts"
import { defaultTheme } from "../../src/style/theme.ts"

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
  test("Style slot merges attrs + fg into the chain", () => {
    // moon.mdBold = { bold: true, fg: "fg" } → fg = moon.fg = #c8d3f5
    expect(style(defaultTheme).mdBold("hi")).toBe("\x1b[1;38;2;200;211;245mhi\x1b[0m")
  })

  test("Style slot with attrs + fg together", () => {
    // moon.borderTitle resolves (via `title` slot) to { bold: true, fg: "primary" }
    // → primary = #82aaff
    expect(style(defaultTheme).borderTitle("T")).toBe("\x1b[1;38;2;130;170;255mT\x1b[0m")
  })

  test("chained attrs before Style slot are preserved when slot doesn't conflict", () => {
    // .underline then .mdBold → bold + underline + moon.fg.
    expect(style(defaultTheme).underline.mdBold("x")).toBe("\x1b[1;4;38;2;200;211;245mx\x1b[0m")
  })

  test("later chain overrides slot values", () => {
    // Slot sets fg=primary; subsequent .red overrides.
    expect(style(defaultTheme).borderTitle.red("x")).toBe("\x1b[1;31mx\x1b[0m")
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

describe("style() — tonal variants via -step suffix", () => {
  test("fg slot-300 resolves through oklch", () => {
    // tokyonight `primary` is `#82aaff`; anchored at step 400, so
    // asking for 300 should yield a lighter hex.
    const out = style(defaultTheme).fg("primary-300" as never)("x")
    // Ensure we got truecolor SGR and it's not the base `#82aaff`.
    expect(out).toMatch(/\x1b\[38;2;(\d+);(\d+);(\d+)m/)
    const m = /\x1b\[38;2;(\d+);(\d+);(\d+)m/.exec(out)!
    const [, r, g, b] = m.map(Number)
    // Lighter than base → higher luminance approx.
    expect(r + g + b).toBeGreaterThan(130 + 170 + 255 - 10)
  })

  test("bracket indexing applies to fg: style.primary[300]", () => {
    const out = style(defaultTheme).primary[300]("x")
    expect(out).toMatch(/\x1b\[38;2;/)
    // Differs from the base primary(500-ish) SGR.
    expect(out).not.toBe(style(defaultTheme).primary("x"))
  })

  test("bracket indexing applies to bg after bgSlot", () => {
    const baseBg = style(defaultTheme).bgPrimary("x")
    const varied = style(defaultTheme).bgPrimary[300]("x")
    expect(varied).toMatch(/\x1b\[48;2;/)
    expect(varied).not.toBe(baseBg)
  })

  test("bracket indexing replaces an existing step (does not stack)", () => {
    const a = style(defaultTheme).primary[300]("x")
    const b = style(defaultTheme).primary[500][300]("x")
    // Final step in both cases is 300 → same output.
    expect(b).toBe(a)
  })

  test("bracket indexing with no prior color set is a no-op", () => {
    // No channel set → [300] returns an empty-style builder; rendered text equals input.
    expect(style(defaultTheme)[300]("hello")).toBe("hello")
  })

  test("bgDiffAdd[200].fgDiffAdd sets bg variant and fg from the slot's own fg", () => {
    const theme = { ...defaultTheme, diffAdd: { bg: "#223344", fg: "#c3e88d" } } as never
    const out = style(theme).bgDiffAdd[200].fgDiffAdd("x")
    // Both fg and bg SGR components present.
    expect(out).toMatch(/\x1b\[(?:[^\]]*;)*48;2;/)
    expect(out).toMatch(/\x1b\[(?:[^\]]*;)*38;2;/)
  })

  test("alpha(n) composites the last color over theme.bg", () => {
    const full = style(defaultTheme).bgPrimary("x")
    const washed = style(defaultTheme).bgPrimary.alpha(30)("x")
    // Both emit a bg SGR, but the washed version's RGB should be closer
    // to moon.bg (#222436) than the full primary (#82aaff).
    const fullM = /\x1b\[48;2;(\d+);(\d+);(\d+)m/.exec(full)!
    const washM = /\x1b\[48;2;(\d+);(\d+);(\d+)m/.exec(washed)!
    expect(washM[0]).not.toBe(fullM[0])
    const fullDist = Math.abs(Number(fullM[1]) - 0x22)
    const washDist = Math.abs(Number(washM[1]) - 0x22)
    expect(washDist).toBeLessThan(fullDist)
  })

  test("alpha(n) replaces an existing alpha (does not stack)", () => {
    const a = style(defaultTheme).primary.alpha(30)("x")
    const b = style(defaultTheme).primary.alpha(60).alpha(30)("x")
    expect(b).toBe(a)
  })

  test("alpha(n) with no prior color set is a no-op", () => {
    expect(style(defaultTheme).alpha(30)("hello")).toBe("hello")
  })
})
