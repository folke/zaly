import type { ManagedSession, Session } from "@zaly/agent/session"
import type { Message } from "@zaly/ai"
import type { Config, ResumeRequest } from "./config.ts"

import { sessionCreate, sessionList, sessionLoad, sessionResume } from "@zaly/agent/session"
import { basename, dirname, isAbsolute } from "pathe"

export interface LoadedSession {
  /** Pre-loaded session for managed/resume paths. Pass to `Agent.load`
   *  to skip the disk hydration step. */
  session?: Session
  /** Materialised messages for Claude Code session imports. Empty for
   *  managed sessions — read `session.messages` instead. */
  messages: Message[]
}

/**
 * Resolve a `Config.resume` directive into either a pre-loaded managed
 * `Session` or a Claude Code import (`messages` only). Pure side-effect-
 * free disk work — no Agent construction. Cheap enough that the TUI can
 * call it during Phase B (post-paint) and stream replay nodes before
 * the agent's model + auth resolution finishes.
 */
export async function loadSession(config: Config): Promise<LoadedSession> {
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

async function resolveExplicit(
  req: Extract<ResumeRequest, { kind: "explicit" }>,
  config: Config
): Promise<LoadedSession> {
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
