import type { AnsiColor } from "../../src/style/types.ts"

import { describe, expect, test } from "vitest"
import { ansiColor } from "../../src/style/ansi.ts"

describe("colorParams — ANSI base names", () => {
  test("fg", () => {
    expect(ansiColor("red", "fg")).toBe("31")
    expect(ansiColor("blue", "fg")).toBe("34")
    expect(ansiColor("white", "fg")).toBe("37")
  })

  test("bg", () => {
    expect(ansiColor("red", "bg")).toBe("41")
    expect(ansiColor("black", "bg")).toBe("40")
  })
})

describe("colorParams — bright variants", () => {
  test("fg base + 90", () => {
    expect(ansiColor("brightRed", "fg")).toBe("91")
    expect(ansiColor("brightBlue", "fg")).toBe("94")
  })

  test("bg base + 100", () => {
    expect(ansiColor("brightRed", "bg")).toBe("101")
  })
})

describe("colorParams — gray aliases", () => {
  test("gray and grey both alias to brightBlack", () => {
    expect(ansiColor("gray", "fg")).toBe("90")
    expect(ansiColor("grey", "fg")).toBe("90")
    expect(ansiColor("gray", "bg")).toBe("100")
  })
})

describe("colorParams — hex", () => {
  test("truecolor fg", () => {
    expect(ansiColor("#82aaff", "fg")).toBe("38;2;130;170;255")
  })

  test("short hex expanded", () => {
    expect(ansiColor("#f00", "fg")).toBe("38;2;255;0;0")
  })

  test("truecolor bg", () => {
    expect(ansiColor("#82aaff", "bg")).toBe("48;2;130;170;255")
  })
})

describe("colorParams — edge cases", () => {
  test("'inherit' returns undefined", () => {
    expect(ansiColor("inherit" as AnsiColor, "fg")).toBeUndefined()
  })

  test("invalid input returns undefined", () => {
    expect(ansiColor("not-a-color" as never, "fg")).toBeUndefined()
    expect(ansiColor("#zzz" as never, "fg")).toBeUndefined()
  })
})
