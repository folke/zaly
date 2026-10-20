import type { TSchema } from "typebox"
import type { ThemeKey } from "../../style/types.ts"
import type { Theme } from "../../themes/types.ts"

import { bundledThemesInfo } from "shiki/themes"
import { Type } from "typebox"
import { defaultsDark } from "../../themes/default.ts"

type ColorKeys<T> = { [K in keyof T]-?: [T[K]] extends [string] ? K : never }[keyof T]
type ColorSlot = Extract<ThemeKey, ColorKeys<Theme<false>>>

// oxlint-disable-next-line sort-keys
const slots = {
  fg: true,
  bg: true,
  primary: true,
  accent: true,
  muted: false,
  quiet: false,
  comment: false,
  title: false,
  delim: false,
  ui: false,
  overlay: false,
  highlight: false,
  divider: false,
  selection: false,
  gutter: false,
  prompt: false,
  border: false,
  borderTitle: false,
  code: false,
  codeTitle: false,
  success: true,
  info: true,
  warn: true,
  error: true,
  syntaxBoolean: false,
  syntaxBracket: false,
  syntaxConstant: false,
  syntaxDelimiter: false,
  syntaxField: false,
  syntaxFunction: false,
  syntaxNumber: false,
  syntaxSpecial: false,
  syntaxString: false,
  mdBold: false,
  mdCode: false,
  mdCodeBlock: false,
  mdCodeBlockTitle: false,
  mdHeading1: false,
  mdHeading2: false,
  mdHeading3: false,
  mdHeading4: false,
  mdHeading5: false,
  mdHeading6: false,
  mdHeading: false,
  mdHr: false,
  mdItalic: false,
  mdLink: false,
  mdListBullet: false,
  mdListChecked: false,
  mdListUnchecked: false,
  mdQuote: false,
  mdStrikethrough: false,
  mdTable: false,
  mdTableHeader: false,
  optionName: false,
  optionDesc: false,
  optionActive: false,
  diffAdd: false,
  diffDel: false,
  diffContext: false,
  diffAddNum: false,
  diffDelNum: false,
  diffContextNum: false,
} satisfies { [K in ThemeKey]: K extends ColorSlot ? true : false }

const hex = "#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})"
const base = `(?:${hex}|${Object.keys(slots).join("|")})`
const color = Type.String({
  description:
    "Hex color, theme slot, or inherit. Hex colors and theme slots may have an integer +/- lightness adjustment.",
  pattern: `^(?:${base}(?:[+-][0-9]+)?|inherit)$`,
})
const style = Type.Object(
  {
    bg: Type.Optional(Type.Ref("#/$defs/Color")),
    bold: Type.Optional(Type.Boolean()),
    dim: Type.Optional(Type.Boolean()),
    fg: Type.Optional(Type.Ref("#/$defs/Color")),
    inverse: Type.Optional(Type.Boolean()),
    italic: Type.Optional(Type.Boolean()),
    strikethrough: Type.Optional(Type.Boolean()),
    underline: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false }
)
const value = Type.Union([Type.Ref("#/$defs/Color"), Type.Ref("#/$defs/Style")])
const properties: Record<string, TSchema> = {
  $schema: Type.Optional(Type.String()),
  appearance: Type.Optional(
    Type.String({
      description: "Dark/light appearance. Inferred from the background when omitted.",
      enum: ["dark", "light"],
    })
  ),
  id: Type.String(),
  name: Type.Optional(Type.String()),
  shiki: Type.Optional(Type.String({ enum: ["auto", ...bundledThemesInfo.map(({ id }) => id)] })),
}
for (const [key, colorOnly] of Object.entries(slots)) {
  const schema = Type.Ref(colorOnly ? "#/$defs/Color" : "#/$defs/Value")
  properties[key] = key in defaultsDark ? Type.Optional(schema) : schema
}

export const schema = Type.Object(properties, {
  $defs: { Color: color, Style: style, Value: value },
  $schema: "http://json-schema.org/draft-07/schema#",
  additionalProperties: Type.Ref("#/$defs/Value"),
})
