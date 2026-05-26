import type { Jiti } from "jiti"
import type { PluginApi } from "./api/api.ts"

import { normPath } from "@zaly/shared"

export type PluginLoader = (api: PluginApi) => Promise<void> | void

let $jiti: Promise<Jiti> | undefined

async function loadJiti(path: string) {
  $jiti ??= import("jiti").then(({ createJiti }) =>
    createJiti(import.meta.url, { moduleCache: false, tryNative: false })
  )
  const jiti = await $jiti
  return jiti.import(path, { default: true })
}

export async function getPluginLoader(path: string): Promise<PluginLoader> {
  path = normPath(path)
  const mod = await loadJiti(path)
  if (typeof mod !== "function")
    throw new Error(`Plugin module ${path} does not export a default function`)
  return mod as PluginLoader
}
