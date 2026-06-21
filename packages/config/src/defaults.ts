import type { Settings } from "./types.ts"

export const defaultSettings: Settings = {
  model: "openai/gpt-5.5",
  permissions: {
    preset: "permissive",
  },
  reasoning: "medium",
  ui: {
    reasoning: true,
    theme: "tokyonight-moon",
    tree: ["assistant", "reasoning", "tools"],
  },
  // FIXME: decide what default tools should be
  tools: [
    "bash",
    "edit",
    "read",
    "write",
    // "agent_send",
    // "agent_spawn",
    // "fetch",
    // "find",
    // "grep",
    "search",
    // "subagent",
    // "task_list",
    // "task_poll",
    // "task_stop",
    // "wakeup",
  ] as const,
}
