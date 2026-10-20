import type { ShikiOpts, ShikiTheme } from "./types.ts"

import { hasColors } from "@zaly/shared/env"
import { isShikiLang } from "../schemas/shiki.ts"

/** List bundled highlighting themes without loading their color definitions. */
export async function shikiThemes() {
  const { bundledThemesInfo } = await import("shiki/themes")
  return bundledThemesInfo.map(({ id, displayName }) => ({
    id: id as ShikiTheme,
    name: displayName,
  }))
}

export async function codeToAnsi(code: string, lang: string, opts?: ShikiOpts): Promise<string> {
  if (!hasColors || !lang || !isShikiLang(lang)) return code
  const { shikiWorker } = await import("../shiki/client.ts")
  const ret = await shikiWorker.highlight(code, lang, opts)
  return ret.value
}
