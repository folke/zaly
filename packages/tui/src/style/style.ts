import type { Theme } from "../themes/types.ts"
import type { AnsiColor, AnsiStyle, Color, Style } from "./types.ts"

import { openAnsi } from "./ansi.ts"
import { isHexColor } from "./color.ts"
import { shiftLightness } from "./oklch.ts"

/**
 * Build the opening SGR escape for a style descriptor. Returns '' if nothing
 * would be emitted. Unresolvable colors (invalid or 'inherit') are dropped.
 *
 * When `theme` is provided, `fg`/`bg` values matching a theme color slot
 * (e.g. `"primary"`, `"muted"`) are resolved against it first. The output
 * ordering is attrs → fg → bg, combined into a single `\x1b[...m` run.
 *
 * @internal
 */
export function openStyle(style: Style, theme?: Theme): string {
  const resolver = ThemeResolver.from(theme)
  const ansiStyle: AnsiStyle = {
    ...style,
    bg: style.bg !== undefined ? resolver.getColor(style.bg, "bg") : undefined,
    fg: style.fg !== undefined ? resolver.getColor(style.fg, "fg") : undefined,
  }
  return openAnsi(ansiStyle)
}

/**
 * Resolve a style-slot reference into a `Style` object. A ref is either a
 * theme slot name (string), an inline `Style`, or `undefined`:
 *
 *  - Inline `Style` → returned as-is (no slot lookup).
 *  - String ref pointing at a **Color** slot → wrapped as `{ fg: <color> }`.
 *  - String ref pointing at a **Style** slot → returned directly.
 *  - String ref that doesn't match a slot → treated as a fg color
 *    (`{ fg: <ref> }`) and resolved downstream by `colorParams`.
 *  - `undefined` → `{}` (emits nothing).
 *
 * @internal
 */
export function resolveStyle(ref: string | Style | undefined, theme?: Theme): Style {
  return ThemeResolver.from(theme).getStyle(ref)
}

function parseColor(c: string): { base: string; lightness?: number } {
  const m = c.match(/^(.+?)([+-]\d{1,3})$/)
  if (!m) return { base: c }
  let lightness = Number(m[2])
  if (!Number.isFinite(lightness))
    throw new TypeError(`Invalid color step in color "${c}": ${m[2]}`)
  lightness = Math.abs(lightness) < 1 ? lightness : lightness / 100
  return { base: m[1], lightness }
}

class ThemeResolver {
  static #cache = new Map<Partial<Theme>, ThemeResolver>()
  static #main = new ThemeResolver()
  #theme: Partial<Theme>
  #styleCache = new Map<string, Style>()
  #colorCache = new Map<string, string>()

  private constructor(theme: Partial<Theme> = {}) {
    this.#theme = theme
  }

  static from(theme?: Theme): ThemeResolver {
    if (theme === undefined) return this.#main
    let resolver = this.#cache.get(theme)
    if (!resolver) {
      resolver = new ThemeResolver(theme)
      this.#cache.set(theme, resolver)
    }
    return resolver
  }

  getStyle(ref?: string | Style, seen?: Set<string>): Style {
    if (ref === undefined) return {}
    if (typeof ref === "object")
      return ref.style ? { ...this.getStyle(ref.style, seen), ...ref } : ref

    let ret = this.#styleCache.get(ref)
    if (ret) return ret

    seen ??= new Set<string>()
    if (seen.has(ref)) throw new TypeError(`Circular dependency for theme slot "${ref}".`)
    seen.add(ref)

    const value = this.#theme[ref as keyof Theme]
    ret = value === undefined ? { fg: ref as Color } : this.getStyle(value, seen)
    this.#styleCache.set(ref, ret)
    return ret
  }

  getColor(ref?: string, kind: "fg" | "bg" = "fg", seen?: Set<string>): AnsiColor {
    if (ref === undefined) return "inherit"

    const key = `${kind}:${ref}`
    let ret = this.#colorCache.get(key)
    if (ret) return ret as AnsiColor

    seen ??= new Set<string>()
    if (seen.has(ref)) throw new TypeError(`Circular dependency for theme slot "${ref}".`)
    seen.add(ref)

    const { base, lightness } = parseColor(ref)

    let value = this.#theme[base as keyof Theme] ?? base
    if (typeof value === "object") value = this.getColor(value[kind], kind, seen)
    else if (value !== base) value = this.getColor(value, kind, seen)
    ret = lightness !== undefined && isHexColor(value) ? shiftLightness(value, lightness) : value
    this.#colorCache.set(key, ret)
    return ret as AnsiColor
  }
}
