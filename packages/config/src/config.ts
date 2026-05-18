import type { Config, Settings } from "./types.ts"

import { normPath, readJson, withError, writeJson } from "@zaly/shared"
import { zalyPaths } from "@zaly/shared/paths"
import { stat } from "node:fs/promises"
import { join } from "pathe"
import { ResourceManager } from "./resource/manager.ts"
import { validateSettings } from "./schemas/gen/settings.ts"
import { merge } from "./utils.ts"

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

export async function updateSettings(dir: string, settings: Settings): Promise<Settings> {
  const path = settingsPath(dir)
  return await writeJson<Settings>(path, (prev) => merge({}, settings, prev))
}

export async function loadConfig(cwd?: string): Promise<Config> {
  cwd = normPath(cwd)
  const userSettings = await loadSettings(zalyPaths.config)

  const paths = zalyPaths.project(cwd)
  const projectSettings = paths.dotZaly ? await loadSettings(paths.dotZaly) : undefined

  // oxlint-disable-next-line sort-keys
  const config: Omit<Config, "resources"> = {
    settings: merge({}, projectSettings ?? {}, userSettings ?? {}),
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
