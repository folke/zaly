import type { AnsiStyle } from "../style/types.ts"
import type { Theme } from "../themes/types.ts"
import type { GeneratedShikiTheme, ShikiSelection, ShikiThemeInput } from "./types.ts"

import { hash } from "@zaly/shared"
import { resolveAnsiStyle } from "../style/style.ts"

export const syntaxScopes = [
  ["comment", ["comment"]],
  ["syntaxString", ["string"]],
  ["syntaxNumber", ["constant.numeric"]],
  [
    "syntaxBoolean",
    ["constant.language.boolean", "constant.language.true", "constant.language.false"],
  ],
  ["syntaxFunction", ["entity.name.function", "support.function", "variable.function"]],
  [
    "syntaxField",
    [
      "variable.other.property",
      "variable.other.object.property",
      "support.type.property-name",
      "meta.object-literal.key",
      "entity.other.attribute-name",
    ],
  ],
  ["syntaxConstant", ["constant", "variable.other.constant"]],
  [
    "syntaxSpecial",
    [
      "keyword",
      "storage",
      "entity.name.type",
      "support.type",
      "constant.language",
      "entity.name.tag",
    ],
  ],
  ["syntaxDelimiter", ["punctuation.separator", "punctuation.terminator", "punctuation.accessor"]],
  ["syntaxBracket", ["punctuation.section", "punctuation.definition"]],
] as const

const cache = new WeakMap<Theme, GeneratedShikiTheme>()

/** Resolve highlighting independently of a theme's display name or origin. */
export function shikiTheme(theme: Theme, selection: ShikiSelection = "auto"): ShikiThemeInput {
  const selected = selection === "auto" ? theme.shiki : selection
  if (selected && selected !== "auto") return selected
  let generated = cache.get(theme)
  if (generated) return generated
  const styles: AnsiStyle[] = [
    resolveAnsiStyle({ fg: "fg" }, theme),
    ...syntaxScopes.map(([slot]) => resolveAnsiStyle(slot, theme)),
  ]
  const appearance = theme.appearance
  generated = { appearance, name: `zaly-${hash(JSON.stringify([appearance, styles]))}`, styles }
  cache.set(theme, generated)
  return generated
}
