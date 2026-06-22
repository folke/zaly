import type { AnyTool, PermissionPresetName } from "@zaly/agent"
import type { AuthSecrets, ReasoningEffort } from "@zaly/ai"
import type { DeepPartial, Simplify } from "@zaly/shared"
import type { EnvPaths, ProjectPaths } from "@zaly/shared/paths"
import type { KeyPatterns } from "@zaly/tui"
import type { ResourceManager } from "./resource/manager.ts"

export type ResolvedSettings = {
  model?: string
  reasoning: ReasoningEffort
  tools: string[]
  ui: {
    /** Tools whose result body should be hidden in the UI. */
    collapsedTools: AnyTool[]
    /** Render images, if supported by the terminal */
    images: boolean
    /** Maximum number of visible rows in selection lists, like pickers and autocomplete. */
    listHeight: number
    /** Whether to show the reasoning trace in the UI. */
    reasoning: boolean
    /** Theme name or path to custom theme file */
    theme: string
    /** What messages to show in the session tree. Defaults to assistant, reasoning, and tools. */
    tree: ("assistant" | "reasoning" | "tools" | "system")[]
    /** Maximum number of visible rows in the session tree. */
    treeHeight: number
  }
  actions: {
    /** Prefix command actions as `/command:COMMAND_NAME`. Defaults to false, e.g. `/COMMAND_NAME`. */
    commandPrefix: boolean
    /** Prefix skill actions as `/skill:SKILL_NAME`. Defaults to true, e.g. `/skill:SKILL_NAME`. */
    skillPrefix: boolean
  }
  compaction: {
    /** Enable automatic compaction when context is full */
    enabled: boolean
    /** Existing messages up to this many tokens will be preserved in the context */
    keepTokens: number
    /** Reasoning effort for the compaction summary */
    reasoning: ReasoningEffort
    /** Maximum number of tokens to use for the generated summary */
    summaryTokens: number
    /** Threshold for automatic compaction. */
    threshold: number
  }
  permissions: {
    preset: PermissionPresetName
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
  /** System integrations and external commands used by zaly. */
  system: {
    /** Command used by the bash tool. */
    bash: string[]
    /** Command used for git packs. */
    git: string[]
    /** Package manager command used for npm packs. */
    npm: string[]
  }
}

export type Settings = Simplify<
  DeepPartial<ResolvedSettings> & {
    $schema?: string
  }
>

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
  settings: ResolvedSettings
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
