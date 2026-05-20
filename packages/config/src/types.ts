import type { PermissionPresetName } from "@zaly/agent"
import type { ReasoningEffort } from "@zaly/ai"
import type { ProjectPaths } from "@zaly/shared/paths"
import type { ResourceManager } from "./resource/manager.ts"

export const defaults: Settings = {
  model: "openai/gpt-5.5",
  permissions: {
    preset: "permissive",
  },
  reasoning: "low",
  theme: "tokyonight-moon",
  tools: [
    "bash",
    "edit",
    "fetch",
    "read",
    "search",
    "subagent",
    "agent_send",
    "agent_spawn",
    "task_list",
    "task_poll",
    "task_stop",
    "wakeup",
    "write",
  ] as const,
}

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
  /** Resources **/
  packs?: string[]
  plugins?: string[]
  skills?: string[]
  themes?: string[]
  prompts?: string[]
}

export type SettingsScope = "user" | "workspace" | "project"

export type LoadedSettings<T extends SettingsScope = SettingsScope> = {
  type: T
  dir: string
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
}
