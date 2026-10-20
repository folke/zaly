import type { ShikiLanguage, ShikiTheme } from "../shiki/types.ts"

import { check as language } from "./gen/shiki-language.ts"
import { check as theme } from "./gen/shiki-theme.ts"

export function isShikiLang(input: unknown): input is ShikiLanguage {
  return language(input)
}

export function isShikiTheme(input: unknown): input is ShikiTheme {
  return theme(input)
}
