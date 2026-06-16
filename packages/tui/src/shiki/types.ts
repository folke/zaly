import type { BundledLanguage, BundledTheme } from "shiki/types"

export type ShikiTheme = BundledTheme
export type ShikiLanguage = BundledLanguage

export type ShikiRequest = {
  key?: string
  code: string
  lang: string
  theme?: ShikiTheme
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

export type ShikiOpts = {
  theme?: ShikiTheme
  signal?: AbortSignal
}
