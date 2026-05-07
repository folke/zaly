import { describe, expect, test } from "vitest"
import { hexToOklch, oklchToHex } from "../../src/style/oklch.ts"

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
