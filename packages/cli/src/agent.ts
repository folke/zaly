import type { Session } from "@zaly/agent"
import type { Message } from "@zaly/ai"
import type { Config } from "./config.ts"

import { Agent, loadClaudeSession, sessionCreate, sessionResume } from "@zaly/agent"
import { chainAuth, codexAuth, envAuth, loadModel } from "@zaly/ai"

/**
 * Build a fresh Agent for the CLI. Mirrors demo/agent.ts in @zaly/agent
 * but without the readline plumbing — the TUI owns input.
 */
export async function buildAgent(config: Config): Promise<Agent> {
  const model = await loadModel(config.modelId, undefined, chainAuth(codexAuth, envAuth))

  let messages: Message[] = []

  let session: Session | undefined

  if (config.claudeSession) {
    const loaded = await loadClaudeSession(config.claudeSession)
    messages = loaded.messages
  } else {
    const scope = { cwd: process.cwd() }
    session = await sessionResume(scope)
    session ??= await sessionCreate(scope)
  }

  return Agent.load({
    messages,
    model,
    permissions: { preset: "yolo" },
    session,
    tools: [
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
    ],
  })
}
