import type { Agent } from "@zaly/agent"
import type { ManagedSession, Session } from "@zaly/agent/session"
import type { Message } from "@zaly/ai"
import type { Config, ResumeRequest } from "./config.ts"

import { sessionCreate, sessionList, sessionLoad, sessionResume } from "@zaly/agent/session"
import { basename, dirname, isAbsolute } from "pathe"

/** Default tool list when `--tools` isn't passed. Mirrors the previous
 *  hard-coded set; can be narrowed per-run via `--tools a,b,c`. */
const DEFAULT_TOOLS = [
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
] as const

/**
 * Build a fresh Agent for the CLI from a resolved `Config`. Owns the
 * resume/session resolution: `--session` and `--resume` both flow
 * through here and end up as either an imported Claude session
 * (`messages` only) or a managed zaly `Session`.
 */
export async function buildAgent(config: Config): Promise<Agent> {
  const { Agent } = await import("@zaly/agent")
  const { loadModel } = await import("@zaly/ai")
  const model = await loadModel(config.modelId, { apiKey: config.apiKey })

  const { messages, session } = await resolveResume(config)
  const tools = config.tools ?? [...DEFAULT_TOOLS]
  const reasoning = config.reasoning ? { effort: config.reasoning } : undefined

  return Agent.load({
    messages,
    model,
    permissions: config.yolo ? { preset: "yolo" } : undefined,
    request: { reasoning },
    session,
    tools,
  })
}

interface ResolvedResume {
  session?: Session
  messages: Message[]
}

async function resolveResume(config: Config): Promise<ResolvedResume> {
  const { resume } = config
  const scope = { cwd: config.cwd }

  switch (resume.kind) {
    case "none": {
      // Default: pick up the most-recent session in this scope, or
      // start fresh.
      const session = (await sessionResume(scope)) ?? (await sessionCreate(scope))
      return { messages: [], session }
    }
    case "latest": {
      const session = await sessionResume(scope)
      if (!session) throw new Error(`no session to resume in ${config.cwd}`)
      return { messages: [], session }
    }
    case "explicit": {
      return resolveExplicit(resume, config)
    }
  }
}

async function resolveExplicit(req: Extract<ResumeRequest, { kind: "explicit" }>, config: Config) {
  const ref = req.value

  // Path forms — Claude Code session imports route here automatically
  // when the path lives under `~/.claude/projects/...`.
  if (ref.includes("/") || ref.endsWith(".jsonl") || isAbsolute(ref)) {
    if (isClaudePath(ref)) {
      const { loadClaudeSession } = await import("@zaly/agent/session/claude")
      const loaded = await loadClaudeSession(ref)
      return { messages: loaded.messages, session: undefined }
    }
    const managed = pathToManaged(ref)
    return { messages: [], session: await sessionLoad(managed) }
  }

  // Bare token: try as id under current scope, then any scope.
  const id = ref
  const inScope = await sessionList({ cwd: config.cwd, id, sort: true })
  const matches = inScope.length > 0 ? inScope : await sessionList({ id, sort: true })
  if (matches.length === 0) throw new Error(`no session found with id \`${id}\``)
  return { messages: [], session: await sessionLoad(matches[0]) }
}

function isClaudePath(p: string): boolean {
  // `~/.claude/projects/<encoded>/<id>.jsonl` is Claude Code's layout.
  return /(?:^|\/)\.claude\/projects\//.test(p)
}

function pathToManaged(input: string): ManagedSession {
  const filePath = input.endsWith(".jsonl") ? input : `${input.replace(/\/$/, "")}/session.jsonl`
  const dir = dirname(filePath)
  const id = basename(dir)
  const scope = basename(dirname(dir))
  return { dir, id, path: filePath, scope }
}
