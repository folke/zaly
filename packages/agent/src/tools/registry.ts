import type { Model, Tool } from "@zaly/ai"
import type { AnyKey } from "@zaly/shared/registry"

import { BaseCollection } from "@zaly/shared/collection"
import { createRegistry } from "@zaly/shared/registry"

/** Per-load context handed to every tool factory. Lets factories
 *  customise the tool — typically schema descriptions — based on the
 *  agent's model and working directory. Tools that don't care about
 *  init just ignore the arg. */
export interface ToolInit {
  model: Model
  cwd: string
}

export type { ToolCollection }
export type ToolLoader = () => Promise<Tool>
export type BuiltinTool = keyof typeof builtin
export type AnyTool = AnyKey<BuiltinTool>

// PERF: `import("./x")` makes TS load the full module type.
// The `as string` erases the dynamic import type while emitting the same JS.
const builtin = {
  agent_send: () => import("./swarm.ts" as string).then((m) => m.agentSendTool as Tool),
  agent_spawn: () => import("./swarm.ts" as string).then((m) => m.agentSpawnTool as Tool),
  bash: () => import("./bash.ts" as string).then((m) => m.bashTool as Tool),
  edit: () => import("./edit.ts" as string).then((m) => m.editTool as Tool),
  fetch: () => import("./fetch.ts" as string).then((m) => m.fetchTool as Tool),
  find: () => import("./find.ts" as string).then((m) => m.findTool as Tool),
  grep: () => import("./grep.ts" as string).then((m) => m.grepTool as Tool),
  read: () => import("./read.ts" as string).then((m) => m.readTool as Tool),
  search: () => import("./search.ts" as string).then((m) => m.searchTool as Tool),
  subagent: () => import("./subagent.ts" as string).then((m) => m.subagentTool as Tool),
  task_list: () => import("./tasks.ts" as string).then((m) => m.taskListTool as Tool),
  task_poll: () => import("./tasks.ts" as string).then((m) => m.taskPollTool as Tool),
  task_stop: () => import("./tasks.ts" as string).then((m) => m.taskStopTool as Tool),
  wakeup: () => import("./wakeup.ts" as string).then((m) => m.wakeupTool as Tool),
  write: () => import("./write.ts" as string).then((m) => m.writeTool as Tool),
} as const satisfies Record<string, ToolLoader>

export const toolRegistry = createRegistry<ToolLoader>("tool").from(builtin)

class ToolCollection extends BaseCollection<AnyTool[], AnyTool[], Tool> {
  list(): AnyTool[] {
    const ret = new Set(toolRegistry.keys())
    for (const r of this.registered) ret.add(r.name)
    return [...ret]
  }

  async load(tools?: AnyTool[]): Promise<Tool[]> {
    const load = async (t: string) =>
      this.registered.findLast((r) => r.name === t) ?? toolRegistry.load(t)
    return await Promise.all((tools ?? this.active).map((t) => load(t)))
  }
}

export async function toolCollection(): Promise<ToolCollection> {
  return new ToolCollection([])
}
