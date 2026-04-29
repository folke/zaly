import {
  Agent,
  agentSendTool,
  agentSpawnTool,
  bashTool,
  editTool,
  fetchTool,
  loadClaudeSession,
  readTool,
  searchTool,
  taskListTool,
  taskPollTool,
  taskStopTool,
  wakeupTool,
  writeTool,
} from "@zaly/agent"
import { loadModel } from "@zaly/ai"
import type { Config } from "./config.ts"

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
    prompt: [
      "You are zaly, a concise coding assistant.",
      "Use the available tools to answer questions about the project.",
      "Prefer batching multiple tool calls where it makes sense.",
    ],
    session: { path: config.sessionPath },
    tools: [
      agentSendTool,
      agentSpawnTool,
      bashTool,
      editTool,
      fetchTool,
      readTool,
      searchTool,
      taskListTool,
      taskPollTool,
      taskStopTool,
      wakeupTool,
      writeTool,
    ],
  })
}
