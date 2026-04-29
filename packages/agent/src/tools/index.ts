import type { Tool } from "@zaly/ai"

import { createRegistry } from "@zaly/shared"

// ── Tool registry ────────────────────────────────────────────────────────

const builtin = {
  agent_send: () => import("./swarm.ts").then((m) => m.agentSendTool),
  agent_spawn: () => import("./swarm.ts").then((m) => m.agentSpawnTool),
  bash: () => import("./bash.ts").then((m) => m.bashTool),
  edit: () => import("./edit.ts").then((m) => m.editTool),
  fetch: () => import("./fetch.ts").then((m) => m.fetchTool),
  read: () => import("./read.ts").then((m) => m.readTool),
  search: () => import("./search.ts").then((m) => m.searchTool),
  subagent: () => import("./subagent.ts").then((m) => m.subagentTool),
  task_list: () => import("./tasks.ts").then((m) => m.taskListTool),
  task_poll: () => import("./tasks.ts").then((m) => m.taskPollTool),
  task_stop: () => import("./tasks.ts").then((m) => m.taskStopTool),
  wakeup: () => import("./wakeup.ts").then((m) => m.wakeupTool),
  write: () => import("./write.ts").then((m) => m.writeTool),
} as const

export type BuiltinTool = keyof typeof builtin
export type ToolName = BuiltinTool | (string & {})

export const toolRegistry = createRegistry<Promise<Tool>>("tool").from(builtin)
