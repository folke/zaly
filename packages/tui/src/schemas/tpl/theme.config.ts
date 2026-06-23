// oxlint-disable import/no-named-as-default-member
import type { ShikiTheme } from "../../shiki/types.ts"
import type {
  AnsiColorName,
  BrightAnsiColorName,
  Color,
  HexColor,
  Style,
  ThemeKey,
} from "../../style/types.ts"
import type { Theme } from "../../themes/types.ts"

import typia from "typia"

type UserStyle = Omit<Style, "fg" | "bg" | "style"> & { fg?: string; bg?: string }

type UserTheme = {
  $schema?: string
  shiki?: ShikiTheme
  id: string
  name?: string
} & Record<string, string | UserStyle>

type ColorKeys<T> = {
  [K in keyof T]-?: [T[K]] extends [Color] ? K : never
}[keyof T]

const toBaseColor = typia.createAssert<
  HexColor | AnsiColorName | BrightAnsiColorName | ThemeKey | "inherit"
>()
const toLightnessColor = typia.createAssert<HexColor | ThemeKey>()
const toStyle = typia.createAssert<UserStyle>()
const isColorKey = typia.createIs<ColorKeys<Theme>>()

function toColor(value: unknown) {
  if (typeof value !== "string") return toBaseColor(value) // will throw
  const color = value.replace(/[+-]\d+/, "")
  if (value.match(/[+-]\d+/)) toLightnessColor(color)
  return toBaseColor(color)
}

const validator = typia.createAssertEquals<Partial<UserTheme>>()

const skipSlots = new Set(["$schema", "shiki", "id", "name"])

export function validateTheme(input: unknown): Partial<UserTheme> {
  const out = validator(input)
  for (const [slot, value] of Object.entries(out)) {
    if (skipSlots.has(slot) || value === undefined) continue
    if (typeof value === "string" && toColor(value)) continue
    if (isColorKey(slot)) toColor(value)
    const style = toStyle(value)
    if (style.fg !== undefined) toColor(style.fg)
    if (style.bg !== undefined) toColor(style.bg)
  }
  return out as unknown as Partial<Theme> & { $schema?: string }
}
