import type { MetaOf, ParamsOf, Tool, ToolCallPart, ToolResult } from "@zaly/ai"
import type { Accessor, Node } from "@zaly/tui"

import { createRegistry } from "@zaly/shared/registry"
import { bashRenderer } from "./bash.ts"
import { defaultRenderer } from "./default.ts"
import { editRenderer } from "./edit.ts"
import { readRenderer } from "./read.ts"
import { writeRenderer } from "./write.ts"

/**
 * Per-tool result rendering.
 *
 * The outer `toolCall` widget owns the chrome (status icon, name,
 * description, params preview). The result body is delegated to a
 * registered renderer keyed by `call.name`. Plugins can register their
 * own via `toolResultRegistry.register("my-tool", myRenderer)`.
 *
 * Each renderer is a `Widget<ToolResultProps>` — a normal widget that
 * takes a reactive `result` accessor and returns a Node. While the
 * call is in flight (`result()` returns `undefined`) the renderer
 * typically shows a placeholder; once the result lands, it can render
 * a code block, diff, or whatever fits the tool's output shape.
 */
export interface ToolResultCtx<T extends Tool = Tool> {
  params?: Partial<ParamsOf<T>>
  call: ToolCallPart<T["name"], ParamsOf<T>>
  /** Reactive — `undefined` while in flight, then the resolved
   *  `ToolResult` when the tool returns. */
  result: Accessor<ToolResult<MetaOf<T>> | undefined>
}

export type ToolRenderer<T extends Tool = Tool> = {
  call?: (ctx: ToolResultCtx<T>) => Node
  result?: (ctx: ToolResultCtx<T>) => Node
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
  find: () => bashRenderer as ToolRenderer,
  grep: () => bashRenderer as ToolRenderer,
  read: () => readRenderer as ToolRenderer,
  write: () => writeRenderer as ToolRenderer,
} as const satisfies Record<string, ToolResultLoader>

const toolResultRegistry = createRegistry<ToolResultLoader>("tool-result").from(builtin)

export function toolRenderer<T extends Tool = Tool>(tool: T["name"]): Required<ToolRenderer<T>> {
  return {
    ...defaultRenderer,
    ...(toolResultRegistry.has(tool) ? toolResultRegistry.load(tool) : {}),
  }
}
