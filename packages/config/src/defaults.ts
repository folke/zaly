import type { ResolvedSettings } from "./types.ts"

// oxlint-disable-next-line sort-keys
export const defaultSettings = {
  model: "openai/gpt-5.5",
  permissions: {
    preset: "permissive",
  },
  reasoning: "medium",
  ui: {
    collapsedTools: ["read"],
    images: true,
    listHeight: 8,
    reasoning: true,
    theme: "tokyonight-moon",
    tree: ["assistant", "reasoning", "tools"],
    treeHeight: 20,
  },
  compaction: {
    enabled: true,
    keepTokens: 20_000,
    reasoning: "medium",
    summaryTokens: 10_000,
    threshold: 0.95,
  },
  actions: {
    commandPrefix: false,
    skillPrefix: true,
  },
  system: {
    bash: ["bash"],
    git: ["git"],
    npm: process.versions.bun ? ["bun"] : ["npm"],
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
} satisfies ResolvedSettings
