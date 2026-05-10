import type { CliArgs } from "./cli.ts"

import { normPath } from "@zaly/shared"

export type ReasoningEffort = "off" | "minimal" | "low" | "medium" | "high" | "xhigh"

/** How the user requested a session for this run. The agent layer
 *  resolves this against the on-disk session manager into a concrete
 *  `Session` (or imported Claude messages). */
export type ResumeRequest =
  | { kind: "none" }
  /** `--resume` flag (no arg) — load most recent session in current scope. */
  | { kind: "latest" }
  /** `--session <x>` — `value` is one of: session id, file path, or scope. */
  | { kind: "explicit"; value: string }

export interface Config {
  cwd: string
  modelId: string
  apiKey?: string
  /** Tool names to expose to the agent. Falls back to the default tool
   *  list (defined in `commands/tui.ts`) when undefined. */
  tools?: string[]
  reasoning?: ReasoningEffort
  /** Theme name (resolved against bundled themes) or filesystem path. */
  theme?: string
  /** Use the `yolo` permissions preset. Default `false`. */
  yolo: boolean
  resume: ResumeRequest
}

/** Resolve runtime config from parsed CLI args + env. Pure — no
 *  filesystem access, no model registry, no auth. The caller (agent.ts /
 *  command handlers) consumes this to build the actual runtime. */
export function resolveConfig(args: CliArgs, env: NodeJS.ProcessEnv = process.env): Config {
  const cwd = normPath(args.cwd ?? process.cwd())
  const modelId = args.model ?? env.ZALY_MODEL ?? env.MODEL ?? "anthropic/claude-sonnet-4-6"
  const reasoning = (args.reasoning ?? args.thinking) as ReasoningEffort | undefined
  // `--session <x>` wins over `--resume` when both are set.
  let resume: ResumeRequest = { kind: "none" }
  if (args.session) resume = { kind: "explicit", value: args.session }
  else if (args.resume === true) resume = { kind: "latest" }
  return {
    apiKey: args["api-key"],
    cwd,
    modelId,
    reasoning,
    resume,
    theme: args.theme,
    tools: parseTools(args.tools),
    yolo: args.yolo === true,
  }
}

/** Accept either `--tools a,b,c` or repeated `--tools a --tools b`. */
function parseTools(v: string | string[] | undefined): string[] | undefined {
  if (v === undefined) return undefined
  const arr = Array.isArray(v) ? v : [v]
  const all = arr
    .flatMap((s) => s.split(","))
    .map((s) => s.trim())
    .filter(Boolean)
  return all.length === 0 ? undefined : all
}
