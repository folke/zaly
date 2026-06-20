import type { PermissionPresetName } from "@zaly/agent"
import type { ReasoningEffort, AuthSecrets } from "@zaly/ai"
import type { EnvPaths, ProjectPaths } from "@zaly/shared/paths"
import type { KeyPatterns } from "@zaly/tui"
import type { ResourceManager } from "./resource/manager.ts"

export type Settings = {
  $schema?: string
  model?: string
  reasoning?: ReasoningEffort
  tools?: string[]
  /** Theme name or path to custom theme file */
  theme?: string
  permissions?: {
    preset?: PermissionPresetName
    allow?: string[]
    deny?: string[]
    ask?: string[]
  }
  resources?: {
    packs?: string[] | false
    plugins?: string[] | false
    skills?: string[] | false
    themes?: string[] | false
    commands?: string[] | false
  }
  keymap?: Record<string, KeyPatterns>
  secrets?: AuthSecrets
}

export type TypiaSettings = Omit<Settings, "keymap"> & {
  keymap?: Record<string, string | string[]>
}

export type SettingsScope = "user" | "workspace" | "project"

export type LoadedSettings<T extends SettingsScope = SettingsScope> = {
  scope: T
  dir: string
  paths: EnvPaths
  settings?: Settings
}

export type Config = {
  settings: Settings
  resources: ResourceManager
  paths: ProjectPaths
  user: LoadedSettings<"user">
  project: LoadedSettings<"project">
  workspace?: LoadedSettings<"workspace">
}

export type State = {
  lastModel?: string
  inputHistory?: string[]
}
