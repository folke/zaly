import type {
  AnsiColorName,
  BrightAnsiColorName,
  Color,
  HexColor,
  ShikiTheme,
  Style,
  ThemeKey,
} from "../../style/index.ts"
import type { Theme } from "../../themes/types.ts"

import { createAssert, createAssertEquals, createIs } from "typia"

type UserStyle = Omit<Style, "fg" | "bg"> & { fg?: string; bg?: string }

type UserTheme = {
  $schema?: string
  shiki?: ShikiTheme
} & Record<string, string | UserStyle>

type ColorKeys<T> = {
  [K in keyof T]-?: [T[K]] extends [Color] ? K : never
}[keyof T]

const toBaseColor = createAssert<
  HexColor | AnsiColorName | BrightAnsiColorName | ThemeKey | "inherit"
>()
const toLightnessColor = createAssert<HexColor | ThemeKey>()
const toStyle = createAssert<UserStyle>()
const isColorKey = createIs<ColorKeys<Theme>>()

function toColor(value: unknown) {
  if (typeof value !== "string") return toBaseColor(value) // will throw
  const color = value.replace(/[+-]\d+/, "")
  if (value.match(/\/\d+/)) toLightnessColor(color)
  return toBaseColor(color)
}

const validator = createAssertEquals<Partial<UserTheme>>()

export function validateTheme(input: unknown): Partial<UserTheme> {
  const out = validator(input)
  for (const [slot, value] of Object.entries(out)) {
    if (slot === "$schema" || slot === "shiki" || value === undefined) continue
    if (typeof value === "string" && toColor(value)) continue
    if (isColorKey(slot)) toColor(value)
    const style = toStyle(value)
    if (style.fg !== undefined) toColor(style.fg)
    if (style.bg !== undefined) toColor(style.bg)
  }
  return out as unknown as Partial<Theme> & { $schema?: string }
}
