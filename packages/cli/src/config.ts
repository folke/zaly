/**
 * Resolve runtime config from argv + env. Pure function — does not
 * touch the filesystem or the model registry. Returns the small bag
 * of values main.ts needs to build the Agent and TUI.
 */
export interface Config {
  modelId: string
  sessionPath: string
  /** Path to a Claude Code session .jsonl to resume from, if any. */
  claudeSession?: string
}

export function resolveConfig(_argv: readonly string[] = []): Config {
  return {
    claudeSession: process.env.CLAUDE_SESSION,
    modelId: process.env.MODEL ?? "anthropic/claude-sonnet-4-6",
    sessionPath: process.env.ZALY_SESSION ?? "agent-session.jsonl",
  }
}
