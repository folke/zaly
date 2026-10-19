import type { BundledLanguage, BundledTheme } from "shiki/types"
import type { AnsiStyle } from "../style/types.ts"

export type ShikiTheme = BundledTheme
export type ShikiLanguage = BundledLanguage
export type ShikiSelection = "auto" | ShikiTheme
export type GeneratedShikiTheme = {
  name: string
  mode: "dark" | "light"
  styles: AnsiStyle[]
}
export type ShikiThemeInput = ShikiTheme | GeneratedShikiTheme

export type ShikiRequest = {
  key?: string
  code: string
  lang: string
  theme?: ShikiThemeInput
  signal?: AbortSignal
}

export type ShikiWorkerRequest = Omit<ShikiRequest, "lang" | "key"> & {
  id: number
  lang: ShikiLanguage
  key: string
}

export type ShikiJob = ShikiWorkerRequest &
  ReturnType<typeof Promise.withResolvers<ShikiResult>> & {
    scheduled?: boolean
  }

export type ShikiResult = {
  id: number
  value: string
  error?: string
  aborted?: boolean
}

export type ShikiWorkerMessage = { type: "ready" } | (ShikiResult & { type: "result" })

export type ShikiOpts = {
  theme?: ShikiThemeInput
  signal?: AbortSignal
}
