import type { Config, LoadedSettings, Settings, SettingsScope } from "./types.ts"

import { normPath, readJson, withError, writeJson } from "@zaly/shared"
import { zalyPaths } from "@zaly/shared/paths"
import { stat } from "node:fs/promises"
import { join } from "pathe"
import { ResourceManager } from "./resource/manager.ts"
import { settingsReviver } from "./reviver.ts"
import { validateSettings } from "./schemas/gen/settings.ts"
import { defaults } from "./types.ts"
import { merge } from "./utils.ts"

function settingsPath(dir: string) {
  return normPath(dir, "settings.json")
}

export async function loadSettings(dir: string): Promise<Settings | undefined> {
  const path = settingsPath(dir)
  const s = await stat(path).catch(() => undefined)
  if (!s?.isFile()) return
  const data = await withError(
    () => readJson(path, settingsReviver),
    `Failed to load settings from \`${path}\``
  )
  return validateSettings(data)
}

export async function updateSettings(dir: string, patch: Settings): Promise<Settings> {
  const path = settingsPath(dir)
  return await writeJson<Settings>(path, (prev) => merge({}, patch, prev))
}

async function loadScope<T extends SettingsScope>(
  dir: string,
  scope: T,
  exists?: boolean
): Promise<LoadedSettings<T>> {
  return { dir, settings: exists !== false ? await loadSettings(dir) : undefined, type: scope }
}

export type LoadConfigOpts = {
  cwd?: string
  workspace?: string
  /** Settings to override coming from CLI flags. */
  settings?: Settings
}

export async function loadConfig(opts: LoadConfigOpts): Promise<Config> {
  const cwd = normPath(opts.cwd)
  const paths = zalyPaths.project(cwd)

  const user = await loadScope(zalyPaths.config, "user")
  const project = await loadScope(
    paths.dotZaly ?? join(paths.root, ".zaly"),
    "project",
    paths.dotZaly !== undefined
  )

  const wsDotZaly = opts.workspace ? zalyPaths.project(opts.workspace).dotZaly : undefined
  const wsDir = opts.workspace ? (wsDotZaly ?? join(opts.workspace, ".zaly")) : undefined
  const workspace =
    wsDir && wsDir !== project.dir // Only load if workspace is different from project
      ? await loadScope(wsDir, "workspace", wsDotZaly !== undefined)
      : undefined

  // oxlint-disable-next-line sort-keys
  const config: Omit<Config, "resources"> = {
    settings: merge(
      {},
      opts.settings,
      project.settings,
      workspace?.settings,
      user.settings,
      defaults
    ),
    paths,
    user,
    project,
    workspace,
  }

  return { ...config, resources: new ResourceManager(config, opts) }
}
