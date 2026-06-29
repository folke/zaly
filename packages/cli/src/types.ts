import type { AgentStatus, PermissionPresetName, TokenUsage } from "@zaly/agent"
import type { Model, ReasoningEffort } from "@zaly/ai"
import type { CamelCase } from "scule"

type CmdRawArgs<C> = C extends (...args: any) => { setup?: (ctx: infer Ctx) => any }
  ? Ctx extends { args: infer A }
    ? A
    : never
  : never

export type CmdArgs<C> = {
  [K in keyof CmdRawArgs<C> as string extends K
    ? never // drop index signature
    : K extends `no-${string}`
      ? never // drop negations
      : K extends "_"
        ? K // keep positional bucket as-is
        : K extends `${string}${infer Rest}` // drop single-char keys (aliases)
          ? Rest extends ""
            ? never
            : CamelCase<K & string>
          : never]: CmdRawArgs<C>[K]
}

export interface Flags {
  cwd?: string
  model?: string
  apiKey?: string
  tools?: string[]
  reasoning?: ReasoningEffort
  permission?: PermissionPresetName
  theme?: string
  yolo?: boolean
  session?: string
  skills?: boolean
  themes?: boolean
  commands?: boolean
  plugins?: boolean
  new?: boolean
}

export type AppState = {
  step: number
  /** Whether the agent is currently processing a request. */
  busy: boolean
  /** True if the agent is busy, or the app is doing something like OAuth login. */
  loading: boolean
  /** The currently active model. */
  model?: Model
  /** The current status of the agent and app */
  status: AgentStatus | "error" | "loading" | "ready"
  /** The current token usage statistics. */
  usage?: TokenUsage
  /** The current reasoning effort. */
  reasoning?: ReasoningEffort
  /** The current scroll position of the render stream */
  scroll: { offset: number; total: number; below: number }
}
