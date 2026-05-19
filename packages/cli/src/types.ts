import type { ReasoningEffort } from "@zaly/ai"

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
