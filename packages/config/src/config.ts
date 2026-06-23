import type { EnvPaths } from "@zaly/shared/paths"
import type { Config, LoadedSettings, Settings, SettingsScope } from "./types.ts"

import { normPath, readJson, withError, writeJson } from "@zaly/shared"
import { zalyPaths } from "@zaly/shared/paths"
import { stat } from "node:fs/promises"
import { defaultSettings } from "./defaults.ts"
import { ResourceManager } from "./resource/manager.ts"
import { settingsReviver } from "./reviver.ts"
import { merge } from "./utils.ts"

function settingsPath(dir: string) {
  return normPath(dir, "settings.json")
}

export async function loadSettings(dir: string): Promise<Settings | undefined> {
  const { validateSettings } = await import("./schemas/gen/settings.ts")
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
  scope: T,
  paths: EnvPaths
): Promise<LoadedSettings<T>> {
  return {
    dir: paths.config,
    paths,
    scope,
    settings: await loadSettings(paths.config),
  }
}

export type LoadConfigOpts = {
  cwd?: string
  workspace?: string
  /** Settings to override coming from CLI flags. */
  settings?: Settings
}

export async function loadConfig(opts: LoadConfigOpts): Promise<Config> {
  const cwd = normPath(opts.cwd)
  const user = await loadScope("user", zalyPaths.env)

  const paths = zalyPaths.project(cwd)
  const project = await loadScope("project", paths.env)

  const wsPaths = opts.workspace ? zalyPaths.project(opts.workspace) : undefined
  const workspace =
    wsPaths && wsPaths.dotZaly !== paths.dotZaly // Only load if workspace is different from project
      ? await loadScope("workspace", wsPaths.env)
      : undefined

  const mergeSettings = () =>
    merge({}, opts.settings, project.settings, workspace?.settings, user.settings, defaultSettings)

  const config: Omit<Config, "resources"> = {
    paths,
    project,
    settings: mergeSettings(),
    update: async (patch: Settings, scope = "user") => {
      const s = scope === "user" ? user : project
      s.settings = await updateSettings(s.dir, patch)
      config.settings = mergeSettings()
      if (patch.resources) resources.refresh()
    },
    user,
    workspace,
  }
  const resources = new ResourceManager(config, opts)

  return Object.assign(config, { resources })
}
