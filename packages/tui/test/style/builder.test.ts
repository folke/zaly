import { describe, expect, test } from "vitest"
import { style } from "../../src/style/builder.ts"
import { moon } from "../../src/style/theme.ts"

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
    expect(style(moon).primary("hi")).toBe("\x1b[38;2;130;170;255mhi\x1b[0m")
  })

  test("theme bg slot via bgPrefix", () => {
    expect(style(moon).bgPrimary("hi")).toBe("\x1b[48;2;130;170;255mhi\x1b[0m")
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
