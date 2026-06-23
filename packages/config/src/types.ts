import type { AnyTool, PermissionPresetName } from "@zaly/agent"
import type { AuthSecrets, ReasoningEffort } from "@zaly/ai"
import type { DeepPartial, Simplify } from "@zaly/shared"
import type { KeyPatterns } from "@zaly/tui"

export type PluginConfig = {
  /** Path to the plugin, either a local path or a remote URI. */
  uri: string
  /** Whether the plugin is enabled. Defaults to true. */
  enabled?: boolean
  /** When set, only include the resources, matching these paths/globs from the plugin. */
  include?: string[]
  /** When set, exclude the resources, matching these paths/globs from the plugin.
   * Exclude is applied after include. */
  exclude?: string[]
}

export type ResolvedConfig = {
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
  plugins?: (string | PluginConfig)[]
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

export type Config = Simplify<
  DeepPartial<ResolvedConfig> & {
    $schema?: string
  }
>

export type TypiaConfig = Omit<Config, "keymap"> & {
  keymap?: Record<string, string | string[]>
}

export type ConfigScope = "user" | "workspace" | "project"

export type State = {
  lastModel?: string
  inputHistory?: string[]
}
