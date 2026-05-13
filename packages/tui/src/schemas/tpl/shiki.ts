import type { ShikiLanguage, ShikiTheme } from "../../style/shiki.ts"

import { createIs } from "typia"

export const isShikiLang = createIs<ShikiLanguage>()
export const isShikiTheme = createIs<ShikiTheme>()
