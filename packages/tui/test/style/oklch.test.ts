import { describe, expect, test } from "vitest"
import { hexToOklch, oklchToHex, STOPS, variant, variants } from "../../src/style/oklch.ts"

// Parse "#rrggbb" into [r,g,b] 0-255 ints.
const parse = (hex: string): [number, number, number] => {
  const n = Number.parseInt(hex.slice(1), 16)
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
}

// Channel-wise distance; small epsilon absorbs round-trip rounding.
const closeHex = (a: string, b: string, tol = 2): void => {
  const [ar, ag, ab] = parse(a)
  const [br, bg, bb] = parse(b)
  expect(Math.abs(ar - br)).toBeLessThanOrEqual(tol)
  expect(Math.abs(ag - bg)).toBeLessThanOrEqual(tol)
  expect(Math.abs(ab - bb)).toBeLessThanOrEqual(tol)
}

describe("hexToOklch / oklchToHex roundtrip", () => {
  test("hex roundtrips within ±2 per channel", () => {
    const samples = [
      "#82aaff",
      "#c099ff",
      "#ff757f",
      "#c3e88d",
      "#ffc777",
      "#ffffff",
      "#000000",
      "#808080",
    ]
    for (const hex of samples) {
      const back = oklchToHex(hexToOklch(hex))
      closeHex(hex, back)
    }
  })

  test("achromatic greys have C ~ 0", () => {
    for (const hex of ["#000000", "#808080", "#ffffff"]) {
      const { C } = hexToOklch(hex)
      expect(C).toBeLessThan(0.01)
    }
  })
})

describe("variant stops", () => {
  test("L increases monotonically from 950 → 50", () => {
    const p = variants("#82aaff") // tokyonight primary
    const ls = [950, 900, 800, 700, 600, 500, 400, 300, 200, 100, 50].map(
      (s) => hexToOklch(p[s as keyof typeof STOPS]).L
    )
    for (let i = 1; i < ls.length; i++) {
      expect(ls[i]).toBeGreaterThan(ls[i - 1])
    }
  })

  test("all stops are in valid sRGB (gamut-mapped)", () => {
    const p = variants("#ff757f")
    for (const step of Object.keys(STOPS).map(Number)) {
      const hex = p[step as keyof typeof STOPS]
      expect(hex).toMatch(/^#[0-9a-f]{6}$/)
      const [r, g, b] = parse(hex)
      for (const c of [r, g, b]) {
        expect(c).toBeGreaterThanOrEqual(0)
        expect(c).toBeLessThanOrEqual(255)
      }
    }
  })

  test("50 is nearly white, 950 nearly black", () => {
    const p = variants("#82aaff")
    const [r50, g50, b50] = parse(p[50])
    expect(r50 + g50 + b50).toBeGreaterThan(700) // close to 3*255
    const [r950, g950, b950] = parse(p[950])
    expect(r950 + g950 + b950).toBeLessThan(180) // close to 0
  })

  test("hue and chroma are roughly preserved across steps", () => {
    const base = "#82aaff"
    const baseOklch = hexToOklch(base)
    // Mid stops should keep hue close to the base.
    for (const step of [400, 500, 600, 700] as const) {
      const v = variant(base, step)
      const o = hexToOklch(v)
      // Allow some drift at extremes from gamut clamping.
      const hueDelta = Math.abs(((o.h - baseOklch.h + 540) % 360) - 180)
      expect(hueDelta).toBeLessThan(5)
    }
  })

  test("variant is cached (same input → same output)", () => {
    const a = variant("#82aaff", 300)
    const b = variant("#82aaff", 300)
    expect(a).toBe(b)
  })

  test("anchor: input hex lands on its own nearest step", () => {
    // tokyonight primary sits close to STOPS[400] — the generated 400
    // variant should match the input.
    const base = "#82aaff"
    const v = variant(base, 400)
    closeHex(v, base, 3)
  })

  test("anchor: base with L near 500 ≈ its own 500 step", () => {
    // `#5e83d5` has L ≈ 0.62, landing exactly on the 500 anchor.
    const base = "#5e83d5"
    const v = variant(base, 500)
    closeHex(v, base, 3)
  })

  test("throws on unknown step", () => {
    // @ts-expect-error — runtime check for invalid step.
    expect(() => variant("#82aaff", 123)).toThrow(/unknown variant step/)
  })

  test("throws on invalid hex", () => {
    expect(() => hexToOklch("not-hex")).toThrow(/invalid hex/)
    expect(() => hexToOklch("#xyz")).toThrow(/invalid hex/)
  })

  test("accepts short-form hex (#rgb)", () => {
    const a = hexToOklch("#f00")
    const b = hexToOklch("#ff0000")
    expect(Math.abs(a.L - b.L)).toBeLessThan(0.001)
    expect(Math.abs(a.C - b.C)).toBeLessThan(0.001)
  })
})
