import type { ReasoningEffort } from "@zaly/ai"
import type { CliArgs } from "./cli.ts"

import { normPath } from "@zaly/shared"

export interface Flags {
  cwd?: string
  /** Explicit `--model` request, if any. The actual id used for the
   *  run is resolved later via `resolveModelId` against the session
   *  and `~/.zaly/state.json` — this field is just the CLI input. */
  model?: string
  apiKey?: string
  /** Tool names to expose to the agent. Falls back to the default tool
   *  list (defined in `commands/tui.ts`) when undefined. */
  tools?: string[]
  reasoning?: ReasoningEffort
  /** Theme name (resolved against bundled themes) or filesystem path. */
  theme?: string
  /** Use the `yolo` permissions preset. Default `false`. */
  yolo: boolean
  session?: string
  skills: boolean
  themes: boolean
  prompts: boolean
  plugins: boolean
  new?: boolean
}

/** Resolve runtime config from parsed CLI args. Pure — no filesystem
 *  access, no model registry, no auth. The caller (agent.ts / command
 *  handlers) consumes this to build the actual runtime. Model id
 *  resolution lives in `resolveModelId` because it depends on the
 *  resumed session, which is loaded async during Phase B. */
export function resolveConfig(args: CliArgs): Flags {
  const tools = args.tools
    ?.split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  return {
    apiKey: args.apiKey,
    cwd: args.cwd ? normPath(args.cwd) : undefined,
    model: args.model,
    new: args.new,
    plugins: args.plugins !== false, // default true
    prompts: args.prompts !== false, // default true
    reasoning: args.reasoning ?? args.thinking,
    session: args.session,
    skills: args.skills !== false, // default true
    theme: args.theme,
    themes: args.themes !== false, // default true
    tools: tools?.length ? tools : undefined,
    yolo: args.yolo === true,
  }
}
