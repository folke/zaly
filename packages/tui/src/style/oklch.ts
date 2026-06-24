/**
 * OKLCH-based tonal scale generation for theme colors.
 *
 * Given a base hex color, `variant(hex, step)` returns a hex variant at
 * the Tailwind-v4-ish step (50..950). The base color's hue and chroma
 * are preserved; only lightness moves. When the resulting color falls
 * outside sRGB, chroma is reduced via binary search (CSS Color Level 4
 * "MinDE chroma reduction") until the color fits — that avoids the
 * saturation blowout you get from naive HSL lightening at the extremes.
 *
 * Matrix constants come from Björn Ottosson's reference OKLab spec:
 * https://bottosson.github.io/posts/oklab/
 */

import type { HexColor } from "./types.ts"

import { clamp } from "@zaly/shared"
import { parseHex, toHex } from "./color.ts"

export interface OKLCH {
  L: number
  C: number
  h: number
}

const cache = new Map<string, HexColor>()

// ---------- conversions ----------

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055
}

export function hexToOklch(hex: string): OKLCH {
  const [r8, g8, b8] = parseHex(hex)
  const r = srgbToLinear(r8 / 255)
  const g = srgbToLinear(g8 / 255)
  const b = srgbToLinear(b8 / 255)

  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b
  const lp = Math.cbrt(l)
  const mp = Math.cbrt(m)
  const sp = Math.cbrt(s)
  const L = 0.2104542553 * lp + 0.793617785 * mp - 0.0040720468 * sp
  const a = 1.9779984951 * lp - 2.428592205 * mp + 0.4505937099 * sp
  const b2 = 0.0259040371 * lp + 0.7827717662 * mp - 0.808675766 * sp
  const C = Math.hypot(a, b2)
  const h = ((Math.atan2(b2, a) * 180) / Math.PI + 360) % 360
  return { C, L, h }
}

/** Convert OKLCH → linear sRGB (unclamped — callers can test for gamut). */
function oklchToLinearRgb({ L, C, h }: OKLCH): [number, number, number] {
  const hr = (h * Math.PI) / 180
  const a = C * Math.cos(hr)
  const b2 = C * Math.sin(hr)
  const lp = L + 0.3963377774 * a + 0.2158037573 * b2
  const mp = L - 0.1055613458 * a - 0.0638541728 * b2
  const sp = L - 0.0894841775 * a - 1.291485548 * b2
  const l = lp ** 3
  const m = mp ** 3
  const s = sp ** 3
  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
  const b = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  return [r, g, b]
}

function inGamut([r, g, b]: [number, number, number], eps = 0.001): boolean {
  return r >= -eps && r <= 1 + eps && g >= -eps && g <= 1 + eps && b >= -eps && b <= 1 + eps
}

/**
 * Convert OKLCH → hex, reducing chroma via binary search when the
 * straightforward conversion falls outside sRGB. The search keeps `L`
 * and `h` fixed and shrinks `C` toward the achromatic axis until the
 * color fits, which is the CSS Color Level 4-recommended behavior.
 */
export function oklchToHex(oklch: OKLCH): HexColor {
  let rgb = oklchToLinearRgb(oklch)
  if (!inGamut(rgb)) {
    // Binary-search on C.
    let lo = 0
    let hi = oklch.C
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2
      if (inGamut(oklchToLinearRgb({ ...oklch, C: mid }))) lo = mid
      else hi = mid
    }
    rgb = oklchToLinearRgb({ ...oklch, C: lo })
  }
  const [r, g, b] = rgb.map((c) => linearToSrgb(Math.max(0, Math.min(1, c)))) as [
    number,
    number,
    number,
  ]
  return toHex(r * 255, g * 255, b * 255)
}

export function shiftLightness(hex: HexColor, delta: number): HexColor {
  const key = `${hex}:${delta}`
  let ret = cache.get(key)
  if (ret) return ret

  const okl = hexToOklch(hex)
  const L = clamp(okl.L + delta, 0, 1)
  // Pull chroma toward 0 as L approaches an extreme. Keeps near-white
  // and near-black from going out of gamut.
  const margin = Math.min(L, 1 - L)
  const C = okl.C * Math.min(1, margin / 0.1)
  cache.set(key, (ret = oklchToHex({ ...okl, C, L })))
  return ret
}
