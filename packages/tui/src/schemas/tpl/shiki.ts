// oxlint-disable import/no-named-as-default-member
import type { ShikiLanguage, ShikiTheme } from "../../style/shiki.ts"

// full import, otherwise typia's code gen includes the import
import typia from "typia"

const lang = typia.createIs<ShikiLanguage>()
const theme = typia.createIs<ShikiTheme>()

export function isShikiLang(input: unknown): input is ShikiLanguage {
  return lang(input)
}

export function isShikiTheme(input: unknown): input is ShikiTheme {
  return theme(input)
}
