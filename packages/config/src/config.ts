import type { Config, Settings } from "./types.ts"

import { normPath, readJson, withError, writeJson } from "@zaly/shared"
import { zalyPaths } from "@zaly/shared/paths"
import { createDefu } from "defu"
import { stat } from "node:fs/promises"
import { join } from "pathe"
import { ResourceManager } from "./resource/manager.ts"
import { validateSettings } from "./schemas/gen/settings.ts"

/** Works like `defu` but replaces arrays instead of merging them. */
export const mergeSettings = createDefu((obj, key, value) => {
  if (Array.isArray(obj[key]) && Array.isArray(value)) {
    obj[key] = value
    return true
  }
})

function settingsPath(dir: string) {
  return normPath(dir, "settings.json")
}

export async function loadSettings(dir: string): Promise<Settings | undefined> {
  const path = settingsPath(dir)
  const s = await stat(path).catch(() => undefined)
  if (!s?.isFile()) return
  const data = await withError(() => readJson(path), `Failed to load settings from \`${path}\``)
  return validateSettings(data)
}

export async function updateSettings(dir: string, settings: Settings) {
  const path = settingsPath(dir)
  await writeJson(path, (prev) => mergeSettings({}, settings, prev))
}

export async function loadConfig(cwd?: string): Promise<Config> {
  cwd = normPath(cwd)
  const userSettings = await loadSettings(zalyPaths.config)

  const paths = zalyPaths.project(cwd)
  const projectSettings = paths.dotZaly ? await loadSettings(paths.dotZaly) : undefined

  // oxlint-disable-next-line sort-keys
  const config: Omit<Config, "resources"> = {
    settings: mergeSettings({}, projectSettings ?? {}, userSettings ?? {}),
    paths,
    user: {
      dir: zalyPaths.config,
      settings: userSettings,
      type: "user",
    },
    project: {
      dir: paths.dotZaly ?? join(paths.root, ".zaly"),
      settings: projectSettings,
      type: "project",
    },
  }

  return { ...config, resources: new ResourceManager(config) }
}
