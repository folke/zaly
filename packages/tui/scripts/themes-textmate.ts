import type { ThemeRegistrationResolved } from "shiki"
import type { HexColor, Style } from "../src/style/types.ts"

import { Theme as TextMateTheme } from "@shikijs/vscode-textmate"
import { blend, parseHex, toHex } from "../src/style/color.ts"

/** Flatten alpha against the surface that will actually display the color. */
export function opaqueColor(background: HexColor, input: string): HexColor {
  if (!/^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(input)) {
    throw new Error(`Invalid theme color: ${input}`)
  }
  let hex = input.slice(1)
  if (hex.length <= 4) hex = hex.replaceAll(/./g, "$&$&")
  const base = `#${hex.slice(0, 6)}` as HexColor
  if (hex.length === 8) return blend(base, background, Number.parseInt(hex.slice(6), 16) / 255)
  return toHex(parseHex(base))
}

type ResolvedStyle = Style<false> & { fg: HexColor }

export function createThemeResolver(theme: ThemeRegistrationResolved) {
  const matcher = TextMateTheme.createFromRawTheme(theme)
  const colors = matcher.getColorMap()
  const defaults = matcher.getDefaults()
  const bg = opaqueColor("#000000", theme.bg)
  const fg = opaqueColor(bg, theme.fg)

  // ScopeStack isn't exported. The matcher only reads these two fields; keep the
  // adapter here rather than depending on private module paths or selector logic.
  type ScopeStack = NonNullable<Parameters<TextMateTheme["match"]>[0]>

  function resolve(query: string): { matched: boolean; style: ResolvedStyle } {
    // oxlint-disable-next-line unicorn/no-null -- TextMate uses null for the root scope.
    let stack: ScopeStack | null = null
    let foregroundId = defaults.foregroundId
    let backgroundId = defaults.backgroundId
    let fontStyle = defaults.fontStyle
    let matched = false
    for (const scopeName of query.split(/\s+/).filter(Boolean)) {
      stack = { parent: stack, scopeName } as ScopeStack
      const rule = matcher.match(stack)
      matched =
        !!rule && (rule.foregroundId !== 0 || rule.backgroundId !== 0 || rule.fontStyle !== -1)
      if (!rule) continue
      if (rule.foregroundId !== 0) foregroundId = rule.foregroundId
      if (rule.backgroundId !== 0) backgroundId = rule.backgroundId
      if (rule.fontStyle !== -1) fontStyle = rule.fontStyle
    }
    const background = opaqueColor(bg, colors[backgroundId])
    // TextMate's ambient const enum cannot be imported with verbatimModuleSyntax.
    const resolved: ResolvedStyle = {
      bold: !!(fontStyle & 2),
      fg: opaqueColor(background, colors[foregroundId]),
      italic: !!(fontStyle & 1),
      strikethrough: !!(fontStyle & 8),
      underline: !!(fontStyle & 4),
    }
    // The global TextMate background isn't a token background override.
    if (backgroundId !== defaults.backgroundId) resolved.bg = background
    return { matched, style: resolved }
  }

  function style(...queries: string[]): ResolvedStyle | undefined {
    for (const query of queries) {
      const result = resolve(query)
      if (result.matched) return result.style
    }
  }

  function color(...keys: string[]): HexColor | undefined {
    for (const key of keys) {
      const value = theme.colors?.[key]
      if (value) return opaqueColor(bg, value)
    }
  }

  return {
    bg,
    color,
    fg,
    resolve: (query: string) => resolve(query).style,
    style,
    tokenColor: (...queries: string[]) => style(...queries)?.fg,
  }
}
