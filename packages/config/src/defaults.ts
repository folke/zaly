import type { Settings } from "./types.ts"

export const defaultSettings: Settings = {
  model: "openai/gpt-5.5",
  permissions: {
    preset: "permissive",
  },
  reasoning: "low",
  theme: "tokyonight-moon",
  tools: [
    "bash",
    "edit",
    "fetch",
    "grep",
    "find",
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
  ] as const,
}
