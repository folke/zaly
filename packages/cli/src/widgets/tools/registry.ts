import type { Tool } from "@zaly/ai"
import type { Node } from "@zaly/tui"
import type { ToolView } from "../tool.ts"

import { createRegistry } from "@zaly/shared/registry"
import { bashRenderer } from "./bash.ts"
import { defaultRenderer, genericRenderer } from "./default.ts"
import { editRenderer } from "./edit.ts"
import { fetchRenderer } from "./fetch.ts"
import { readRenderer } from "./read.ts"
import { skillRenderer } from "./skill.ts"
import { writeRenderer } from "./write.ts"

/**
 * Per-tool result rendering.
 *
 * The outer `toolCall` widget owns the chrome (status icon, name,
 * description, params preview). The result body is delegated to a
 * registered renderer keyed by `call.name`. Plugins can register their
 * own via `toolResultRegistry.register("my-tool", myRenderer)`.
 *
 * Call and result renderers receive the same ToolView. Read its reactive
 * getters inside memos/render callbacks; result is undefined until the tool completes.
 */
export type ToolRenderer<T extends Tool = Tool> = {
  call?: (view: Readonly<ToolView<T>>) => Node
  result?: (view: Readonly<ToolView<T>>) => Node
}

export type ToolResultLoader = () => ToolRenderer

// Loaders are thunks so the registry shape (`(opts) => V`) matches —
// `void` opts, value is the renderer. This lets plugins register their
// own via `toolResultRegistry.register("my-tool", () => myRenderer)` at
// runtime, and leaves the door open for lazy `import()` loaders later
// without breaking the call site.
const builtin = {
  bash: () => bashRenderer as ToolRenderer,
  edit: () => editRenderer as ToolRenderer,
  fetch: () => fetchRenderer as ToolRenderer,
  find: () => bashRenderer as ToolRenderer,
  grep: () => bashRenderer as ToolRenderer,
  read: () => readRenderer as ToolRenderer,
  search: () => genericRenderer({ lang: "markdown" }) as ToolRenderer,
  skill: () => skillRenderer as ToolRenderer,
  write: () => writeRenderer as ToolRenderer,
} as const satisfies Record<string, ToolResultLoader>

const toolResultRegistry = createRegistry<ToolResultLoader>("tool-result").from(builtin)

export function toolRenderer<T extends Tool = Tool>(tool: T["name"]): Required<ToolRenderer<T>> {
  return {
    ...defaultRenderer,
    ...(toolResultRegistry.has(tool) ? (toolResultRegistry.load(tool) as ToolRenderer<T>) : {}),
  }
}
