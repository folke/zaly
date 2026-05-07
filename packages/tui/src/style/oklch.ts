// oxlint-disable unicorn/no-zero-fractions
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
  return c <= 0.040_45 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function linearToSrgb(c: number): number {
  return c <= 0.003_130_8 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055
}

export function hexToOklch(hex: string): OKLCH {
  const [r8, g8, b8] = parseHex(hex)
  const r = srgbToLinear(r8 / 255)
  const g = srgbToLinear(g8 / 255)
  const b = srgbToLinear(b8 / 255)

  const l = 0.412_221_470_8 * r + 0.536_332_536_3 * g + 0.051_445_992_9 * b
  const m = 0.211_903_498_2 * r + 0.680_699_545_1 * g + 0.107_396_956_6 * b
  const s = 0.088_302_461_9 * r + 0.281_718_837_6 * g + 0.629_978_700_5 * b
  const lp = Math.cbrt(l)
  const mp = Math.cbrt(m)
  const sp = Math.cbrt(s)
  const L = 0.210_454_255_3 * lp + 0.793_617_785_0 * mp - 0.004_072_046_8 * sp
  const a = 1.977_998_495_1 * lp - 2.428_592_205_0 * mp + 0.450_593_709_9 * sp
  const b2 = 0.025_904_037_1 * lp + 0.782_771_766_2 * mp - 0.808_675_766_0 * sp
  const C = Math.hypot(a, b2)
  const h = ((Math.atan2(b2, a) * 180) / Math.PI + 360) % 360
  return { C, L, h }
}

/** Convert OKLCH → linear sRGB (unclamped — callers can test for gamut). */
function oklchToLinearRgb({ L, C, h }: OKLCH): [number, number, number] {
  const hr = (h * Math.PI) / 180
  const a = C * Math.cos(hr)
  const b2 = C * Math.sin(hr)
  const lp = L + 0.396_337_777_4 * a + 0.215_803_757_3 * b2
  const mp = L - 0.105_561_345_8 * a - 0.063_854_172_8 * b2
  const sp = L - 0.089_484_177_5 * a - 1.291_485_548_0 * b2
  const l = lp ** 3
  const m = mp ** 3
  const s = sp ** 3
  const r = 4.076_741_662_1 * l - 3.307_711_591_3 * m + 0.230_969_929_2 * s
  const g = -1.268_438_004_6 * l + 2.609_757_401_1 * m - 0.341_319_396_5 * s
  const b = -0.004_196_086_3 * l - 0.703_418_614_7 * m + 1.707_614_701_0 * s
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
  return toHex(r, g, b)
}

export function modifyOklch(hex: HexColor, modify: (o: OKLCH) => OKLCH): HexColor {
  return oklchToHex(modify(hexToOklch(hex)))
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
