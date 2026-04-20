import { describe, expect, test } from "vitest"
import { colorParams } from "../../src/style/color.ts"
import { moon } from "../../src/style/theme.ts"

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
    expect(colorParams("primary", "fg", moon)).toBe("38;2;130;170;255")
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

describe("colorParams — Style-valued theme slot", () => {
  test("extracts the matching channel from a Style slot (fg ← slot.fg)", () => {
    const theme = {
      ...moon,
      mdHeading: { bold: true, fg: "primary", underline: true },
    } as never
    // Resolves to `primary` → `#82aaff` → the truecolor SGR for it.
    const hex = moon.primary
    const r = Number.parseInt(hex.slice(1, 3), 16)
    const g = Number.parseInt(hex.slice(3, 5), 16)
    const b = Number.parseInt(hex.slice(5, 7), 16)
    expect(colorParams("mdHeading", "fg", theme)).toBe(`38;2;${r};${g};${b}`)
  })

  test("extracts the bg channel when asked for bg", () => {
    const theme = { ...moon, diffAdd: { bg: "#223344", fg: "ok" } } as never
    expect(colorParams("diffAdd", "bg", theme)).toBe("48;2;34;51;68")
  })

  test("throws when the Style slot lacks the requested channel", () => {
    const theme = { ...moon, mdHeading: { bold: true, underline: true } } as never
    expect(() => colorParams("mdHeading", "fg", theme)).toThrow(/without a fg color/)
  })
})
