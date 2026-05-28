import type { BundledLanguage, BundledTheme } from "shiki/types"

export type ShikiTheme = BundledTheme
export type ShikiLanguage = BundledLanguage

export type ShikiRequest = {
  key?: string
  code: string
  lang: string
  theme?: ShikiTheme
}

export type ShikiJob = Omit<ShikiRequest, "lang" | "key"> & {
  lang: ShikiLanguage
  key: string
}

export type ShikiResult = { key: string; value: string; error?: string }

export type ShikiWorkerRequest = {
  id: number
  jobs: ShikiJob[]
}

export type ShikiWorkerResponse = {
  id: number
  results: ShikiResult[]
}
