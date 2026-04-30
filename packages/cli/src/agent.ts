import type { Config } from "./config.ts"

import { Agent, loadClaudeSession } from "@zaly/agent"
import { loadModel } from "@zaly/ai"

/**
 * Build a fresh Agent for the CLI. Mirrors demo/agent.ts in @zaly/agent
 * but without the readline plumbing — the TUI owns input.
 */
export async function buildAgent(config: Config): Promise<Agent> {
  const model = await loadModel(config.modelId)

  let messages
  if (config.claudeSession) {
    const loaded = await loadClaudeSession(config.claudeSession)
    messages = loaded.messages
  }

  return Agent.load({
    messages,
    model,
    permissions: { preset: "yolo" },
    session: { path: config.sessionPath },
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
