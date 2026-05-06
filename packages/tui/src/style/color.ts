import type { Step } from "./oklch.ts"
import type { ColorStep, HexColor, RGBA } from "./types.ts"

// oxlint-disable unicorn/consistent-function-scoping
import { variant } from "./oklch.ts"

/** Linear-sRGB blend of two opaque hex colors. `alpha` is the weight of
 *  `fgHex`; the rest comes from `bgHex`. Returns an opaque 6-digit hex. */
export function blend(fgHex: HexColor, bgHex: HexColor, alpha: number): HexColor {
  const fg = parseHex(fgHex)
  const bg = parseHex(bgHex)
  if (fg === undefined || bg === undefined) return fgHex
  const lin = (c: number): number => {
    const u = c / 255
    return u <= 0.040_45 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4
  }
  const srgb = (c: number): number => {
    const v = c <= 0.003_130_8 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055
    return Math.max(0, Math.min(255, Math.round(v * 255)))
  }
  const mix = (a: number, b: number): number => srgb(alpha * lin(a) + (1 - alpha) * lin(b))
  const r = mix(fg.r, bg.r)
  const g = mix(fg.g, bg.g)
  const b = mix(fg.b, bg.b)
  const h = (n: number): string => n.toString(16).padStart(2, "0")
  return `#${h(r)}${h(g)}${h(b)}`
}

export function parseHex(input: HexColor): RGBA | undefined {
  if (!isHexColor(input)) return
  let rgba: RGBA | undefined
  // Alpha channel (4/8-char forms) is stripped upstream by `splitHexAlpha`
  // so colorParams always sees an opaque form. Still accept 4/8 here for
  // robustness on direct callers — alpha byte is ignored.
  const hex = input.slice(1)
  if (hex.length === 3 || hex.length === 4) {
    const r = nibble(hex[0])
    const g = nibble(hex[1])
    const b = nibble(hex[2])
    const a = nibble(hex[3])
    if (r === undefined || g === undefined || b === undefined) return
    rgba = {
      a: a === undefined ? undefined : (a * 17) / 255,
      b: b * 17,
      g: g * 17,
      hex: input,
      r: r * 17,
    }
  } else if (hex.length === 6 || hex.length === 8) {
    const r = byte(hex.slice(0, 2))
    const g = byte(hex.slice(2, 4))
    const b = byte(hex.slice(4, 6))
    const a = byte(hex.slice(6, 8))
    if (r === undefined || g === undefined || b === undefined) return
    rgba = { a: a === undefined ? undefined : a / 255, b, g, hex: input, r }
  } else return
  rgba.hex = `#${toHex(rgba.r)}${toHex(rgba.g)}${toHex(rgba.b)}`
  return rgba
}

function toHex(c: number): string {
  c = Math.max(0, Math.min(255, Math.round(c)))
  return c.toString(16).padStart(2, "0")
}

function nibble(c: string): number | undefined {
  const n = Number.parseInt(c, 16)
  return Number.isNaN(n) ? undefined : n
}

function byte(s: string): number | undefined {
  if (!/^[0-9a-fA-F]{2}$/.test(s)) return undefined
  return Number.parseInt(s, 16)
}

export function isHexColor(s: string): s is HexColor {
  return /^#[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6,8}$/.test(s)
}

export function modifyColor(
  color: HexColor,
  opts: { alpha?: number; step?: ColorStep | Step; bg?: HexColor }
): HexColor {
  const rgba = parseHex(color)
  if (rgba === undefined) return color
  const alpha = opts.alpha ?? rgba.a
  let hex = rgba.hex
  if (opts.step !== undefined) hex = variant(hex, Number(opts.step) as Step)
  if (alpha !== undefined) {
    const bg = opts.bg ?? "#000000"
    hex = blend(hex, bg, alpha)
  }
  return hex
}
