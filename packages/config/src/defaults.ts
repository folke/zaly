import type { ResolvedConfig } from "./types.ts"

// oxlint-disable-next-line sort-keys
export const defaultSettings = {
  permissions: {
    preset: "permissive",
  },
  reasoning: "medium",
  ui: {
    collapsedTools: ["read"],
    copyOnSelect: true,
    images: true,
    listHeight: 10,
    mode: "fullscreen",
    reasoning: true,
    sessionTree: ["assistant", "reasoning", "tools"],
    theme: "tokyonight-moon",
    treeHeight: 20,
  },
  compaction: {
    enabled: true,
    keepTokens: 20_000,
    reasoning: "medium",
    summaryTokens: 10_000,
    threshold: 0.95,
  },
  masking: {
    delta: 0.25,
    enabled: true,
    keepTurns: 40,
    minTokens: 50,
    target: 0.5,
  },
  skills: {
    actionPrefix: "skill:",
    actions: true,
    enabled: true,
  },
  commands: {
    actionPrefix: "",
    bash: true,
    expr: true,
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
    "fetch",
    "find",
    "grep",
    // "agent_send",
    // "agent_spawn",
    // "subagent",
    "task_list",
    "task_poll",
    "task_stop",
    // "wakeup",
    ...(process.env.BRAVE_API_KEY ? ["search"] : []),
  ] as const,
} satisfies ResolvedConfig
