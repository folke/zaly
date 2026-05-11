import type { Model, Tool } from "@zaly/ai"

import { createRegistry } from "@zaly/shared/registry"

/** Per-load context handed to every tool factory. Lets factories
 *  customise the tool — typically schema descriptions — based on the
 *  agent's model and working directory. Tools that don't care about
 *  init just ignore the arg. */
export interface ToolInit {
  model: Model
  cwd: string
}

const builtin = {
  agent_send: () => import("./swarm.ts").then((m) => m.agentSendTool),
  agent_spawn: () => import("./swarm.ts").then((m) => m.agentSpawnTool),
  bash: () => import("./bash.ts").then((m) => m.bashTool),
  edit: () => import("./edit.ts").then((m) => m.editTool),
  fetch: (init: ToolInit) => import("./fetch.ts").then((m) => m.createFetchTool(init)),
  read: (init: ToolInit) => import("./read.ts").then((m) => m.createReadTool(init)),
  search: () => import("./search.ts").then((m) => m.searchTool),
  subagent: () => import("./subagent.ts").then((m) => m.subagentTool),
  task_list: () => import("./tasks.ts").then((m) => m.taskListTool),
  task_poll: () => import("./tasks.ts").then((m) => m.taskPollTool),
  task_stop: () => import("./tasks.ts").then((m) => m.taskStopTool),
  wakeup: () => import("./wakeup.ts").then((m) => m.wakeupTool),
  write: () => import("./write.ts").then((m) => m.writeTool),
} as const satisfies Record<string, (init: ToolInit) => Promise<Tool>>

export type BuiltinTool = keyof typeof builtin
export type AnyTool = BuiltinTool | (string & {})

export const toolRegistry = createRegistry<Promise<Tool>, ToolInit>("tool").from(builtin)
