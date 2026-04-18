import { describe, expect, test } from "vitest"
import { colorParams } from "../../src/style/color.ts"
import { tokyoNightMoon } from "../../src/themes/tokyonight-moon.ts"

describe("colorParams — ANSI base names", () => {
  test("fg", () => {
    expect(colorParams("red", "fg")).toBe("31")
    expect(colorParams("blue", "fg")).toBe("34")
    expect(colorParams("white", "fg")).toBe("37")
  })

  test("bg", () => {
    expect(colorParams("red", "bg")).toBe("41")
    expect(colorParams("black", "bg")).toBe("40")
  })
})

describe("colorParams — bright variants", () => {
  test("fg base + 90", () => {
    expect(colorParams("brightRed", "fg")).toBe("91")
    expect(colorParams("brightBlue", "fg")).toBe("94")
  })

  test("bg base + 100", () => {
    expect(colorParams("brightRed", "bg")).toBe("101")
  })
})

describe("colorParams — gray aliases", () => {
  test("gray and grey both alias to brightBlack", () => {
    expect(colorParams("gray", "fg")).toBe("90")
    expect(colorParams("grey", "fg")).toBe("90")
    expect(colorParams("gray", "bg")).toBe("100")
  })
})

describe("colorParams — hex", () => {
  test("truecolor fg", () => {
    expect(colorParams("#82aaff", "fg")).toBe("38;2;130;170;255")
  })

  test("short hex expanded", () => {
    expect(colorParams("#f00", "fg")).toBe("38;2;255;0;0")
  })

  test("truecolor bg", () => {
    expect(colorParams("#82aaff", "bg")).toBe("48;2;130;170;255")
  })
})

describe("colorParams — theme slots", () => {
  test("slot resolves through theme; hex slot → truecolor", () => {
    expect(colorParams("primary", "fg", tokyoNightMoon)).toBe("38;2;130;170;255")
  })

  test("no theme passed: slot name drops silently", () => {
    expect(colorParams("primary", "fg")).toBeUndefined()
  })
})

describe("colorParams — edge cases", () => {
  test("'inherit' returns undefined", () => {
    expect(colorParams("inherit", "fg")).toBeUndefined()
  })

  test("invalid input returns undefined", () => {
    expect(colorParams("not-a-color" as never, "fg")).toBeUndefined()
    expect(colorParams("#zzz" as never, "fg")).toBeUndefined()
  })
})
