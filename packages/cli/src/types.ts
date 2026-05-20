import type { Model, ReasoningEffort, Usage } from "@zaly/ai"

export interface Flags {
  cwd?: string
  model?: string
  apiKey?: string
  tools?: string[]
  reasoning?: ReasoningEffort
  theme?: string
  yolo?: boolean
  session?: string
  skills?: boolean
  themes?: boolean
  prompts?: boolean
  plugins?: boolean
  new?: boolean
}

export type AppState = {
  busy: boolean
  model?: Model
  status: string
  usage: Usage
}
