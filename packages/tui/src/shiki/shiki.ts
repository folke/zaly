import type { ShikiTheme } from "./types.ts"

import { hasColors } from "@zaly/shared/env"
import { isShikiLang } from "../schemas/gen/shiki.ts"

export async function codeToAnsi(code: string, lang?: string, theme?: ShikiTheme): Promise<string> {
  if (!hasColors || !lang || !isShikiLang(lang)) return code
  const { shikiWorker } = await import("../shiki/client.ts")
  const ret = await shikiWorker.highlight(code, lang, theme)
  return ret.value
}
