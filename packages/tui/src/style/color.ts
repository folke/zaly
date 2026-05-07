import type { HexColor, RGB } from "./types.ts"

import { clamp } from "@zaly/shared"

export function toHex(c: RGB): HexColor
export function toHex(r: number, g: number, b: number): HexColor
export function toHex(x: number | RGB, y?: number, z?: number): HexColor {
  const [r, g, b] = Array.isArray(x) ? x : [x, y!, z!]
  const h = (n: number): string =>
    clamp(Math.round(n * 255), 0, 255)
      .toString(16)
      .padStart(2, "0")
  return `#${h(r)}${h(g)}${h(b)}`
}

export function parseHex(hex: string): RGB {
  let s = hex.charCodeAt(0) === 0x23 ? hex.slice(1) : hex // strip leading #
  if (s.length === 3) {
    // Expand "abc" → "aabbcc" without allocating an array.
    s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2]
  }
  if (s.length !== 6) throw new Error(`invalid hex color: ${hex}`)
  const n = Number.parseInt(s, 16)
  if (Number.isNaN(n)) throw new Error(`invalid hex color: ${hex}`)
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
}

export function isHexColor(s: string): s is HexColor {
  return /^#[0-9a-fA-F]{3,8}$/.test(s)
}
