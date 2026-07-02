import type { AnyTool, PermissionPresetName } from "@zaly/agent"
import type { ReasoningEffort } from "@zaly/ai"
import type { DeepPartial, Simplify } from "@zaly/shared"
import type { KeyPatterns } from "@zaly/tui"

export type ResourceFilter = {
  /** Whether the plugin is enabled. Defaults to true. */
  enabled?: boolean
  /** When set, only include the resources, matching these paths/globs from the plugin. */
  include?: string[]
  /** When set, exclude the resources, matching these paths/globs from the plugin.
   * Add a resource type to the exclude list to disable that resource type. For example,
   * `["skills"]` will disable all skills from the plugin.
   * Exclude is applied after include. */
  exclude?: string[]
}

export type ResolvedConfig = {
  /** Defaul model to use for the agent **/
  model?: string
  /** Default reasoning effort **/
  reasoning: ReasoningEffort
  tools: string[]
  ui: {
    /** scrollback: preserves terminal scrollback/search; footer scrolls away with mouse wheel because the terminal is scrolling
   /* fullscreen: alternate screen + mouse; footer stays fixed; dedicated app viewport */
    mode: "scrollback" | "fullscreen"
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
    sessionTree: ("assistant" | "reasoning" | "tools" | "system")[]
    /** Maximum number of visible rows in the session tree. */
    treeHeight: number
  }
  skills: {
    /** Allow skills to be used by the agent. Defaults to true. */
    enabled: boolean
    /** Show skill actions. Defaults to true. */
    actions?: boolean
    /** Prefix for command actions. Defaults to `skill:`, e.g `/skill:SKILL_NAME` */
    actionPrefix?: string
  }
  /** Template commands **/
  commands: {
    /** Prefix for command actions. Defaults to `` */
    actionPrefix?: string
    /** Allow bash execution in commands. Defaults to true. */
    bash?: boolean
    /** Allow js expressions in command templates. Defaults to true. */
    expr?: boolean
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
  masking: {
    /** Whether to enable masking. Defaults to true. */
    enabled: boolean
    /** Don't mask tool-result parts whose original content is shorter
     *  than this (estimated tokens). Skips tiny "ok"-style success
     *  messages where the stub would be larger than the original.
     *  Doesn't apply to attachments (always worth masking). */
    minTokens: number
    /** How many turns to keep in the tail of the conversation, regardless
     *  of score. Defaults to 20. */
    keepTurns: number
    /** How far above the target ratio to trigger a new masking pass.
     *  Defaults to 0.25 (25%). */
    delta: number
    /** Target ratio of used/limit tokens to reach by masking. Defaults to 0.5 (50%). */
    target: number
  }
  permissions: {
    /** Permissions preset to use. Defaults to "permissive". */
    preset: PermissionPresetName
    allow?: string[]
    deny?: string[]
    ask?: string[]
  }
  plugins?: string[]
  keymap?: Record<string, KeyPatterns>
  /** Resource configuration for zaly. */
  resources?: Record<string, ResourceFilter>
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
