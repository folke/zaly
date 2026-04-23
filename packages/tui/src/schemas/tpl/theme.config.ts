import type { Style } from "../../style/ansi.ts"
import type {
  AnsiColorName,
  BrightAnsiColorName,
  Color,
  ColorStep,
  HexColor,
  ThemeKey,
} from "../../style/color.ts"
import type { ShikiTheme, Theme } from "../../style/index.ts"

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
const toStepColor = createAssert<HexColor | ThemeKey>()
const toAlphaColor = createAssert<ThemeKey>()
const toStyle = createAssert<UserStyle>()
const toStep = createAssert<ColorStep>()
const isColorKey = createIs<ColorKeys<Theme>>()

function toColor(value: unknown) {
  if (typeof value !== "string") return toBaseColor(value) // will throw
  const color = value.replace(/\/\d+/, "").replace(/-\d+/, "")
  if (value.match(/\/\d+/)) toAlphaColor(color)
  const step = value.match(/-(\d+)/)
  if (step) {
    toStep(step[1])
    return toStepColor(color)
  }
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
