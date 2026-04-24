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

/**
 * Tailwind-v4-style tonal stops (approximate). Values chosen to land on
 * a perceptually-even spread in the OKLab L channel:
 *
 *   50  → very light tint
 *   500 → base lightness (roughly matching a well-designed brand color)
 *   950 → very dark shade
 */
export const STOPS = {
  50: 0.98,
  100: 0.95,
  200: 0.89,
  300: 0.81,
  400: 0.7,
  500: 0.62,
  600: 0.55,
  700: 0.47,
  800: 0.37,
  900: 0.27,
  950: 0.18,
} as const

export type Step = keyof typeof STOPS

export const steps: readonly Step[] = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]

export interface OKLCH {
  L: number
  C: number
  h: number
}

// ---------- conversions ----------

function parseHex(hex: string): [number, number, number] {
  let s = hex.trim().replace(/^#/, "")
  // oxlint-disable-next-line typescript/no-misused-spread
  if (s.length === 3) s = [...s].map((c) => c + c).join("")
  if (s.length !== 6) throw new Error(`invalid hex color: ${hex}`)
  const n = Number.parseInt(s, 16)
  if (Number.isNaN(n)) throw new Error(`invalid hex color: ${hex}`)
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
}

function toHex(r: number, g: number, b: number): string {
  // oxlint-disable-next-line unicorn/consistent-function-scoping
  const h = (n: number): string =>
    Math.max(0, Math.min(255, Math.round(n * 255)))
      .toString(16)
      .padStart(2, "0")
  return `#${h(r)}${h(g)}${h(b)}`
}

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
export function oklchToHex(oklch: OKLCH): string {
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

// ---------- variant generation ----------

/**
 * Return a tonal variant of `hex` at the given step (50..950).
 *
 * The input color is anchored at whichever stop's L is closest to it,
 * so passing e.g. `#82aaff` (L ≈ 0.70) gets placed at step 400 and the
 * generated 400 variant matches the input byte-for-byte. The other
 * stops are interpolated between the input's L and the tint/shade
 * extremes (STOPS[50] / STOPS[950]), so the full palette stays evenly
 * spread without shifting the caller's chosen hex off its own step.
 *
 * Hue and chroma are preserved; only L moves. Out-of-sRGB results are
 * chroma-reduced via `oklchToHex`. Results are cached keyed on
 * `${hex}:${step}`.
 */
export function variant(hex: string, step: Step): string {
  const key = `${hex}:${step}`
  const cached = cache.get(key)
  if (cached !== undefined) return cached
  if (!(step in STOPS)) throw new Error(`unknown variant step: ${step}`)
  const base = hexToOklch(hex)
  const targetL = anchorL(base.L, step)
  const out = oklchToHex({ ...base, L: targetL })
  cache.set(key, out)
  return out
}

/**
 * Compute the target L for `step`, anchored so the stop closest to
 * `baseL` returns `baseL` exactly. Intermediate stops interpolate
 * linearly (in step index) between the anchor and the tint/shade
 * extremes.
 */
function anchorL(baseL: number, step: Step): number {
  let anchor: Step = 500
  let best = Number.POSITIVE_INFINITY
  for (const s of steps) {
    const d = Math.abs(STOPS[s] - baseL)
    if (d < best) {
      best = d
      anchor = s
    }
  }
  if (step === anchor) return baseL
  const aIdx = steps.indexOf(anchor)
  const sIdx = steps.indexOf(step)
  if (sIdx < aIdx) {
    // Tint side: interpolate from STOPS[50] (at idx 0) up to baseL.
    const t = sIdx / aIdx
    return STOPS[50] * (1 - t) + baseL * t
  }
  // Shade side: interpolate from baseL down to STOPS[950] (at last idx).
  const t = (sIdx - aIdx) / (steps.length - 1 - aIdx)
  return baseL * (1 - t) + STOPS[950] * t
}

/** Return the full 11-stop palette for a base color. */
export function variants(hex: string): Record<Step, string> {
  const out = {} as Record<Step, string>
  for (const s of steps) out[s] = variant(hex, s)
  return out
}

const cache = new Map<string, string>()
