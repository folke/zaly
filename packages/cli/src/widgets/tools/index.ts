import type { ParamsOf, Tool, ToolCallPart, ToolResult } from "@zaly/ai"
import type { Accessor, Widget } from "@zaly/tui"

import { createRegistry } from "@zaly/shared"
import { widget } from "@zaly/tui"
import { bashResult } from "./bash.ts"
import { defaultResult } from "./default.ts"
import { readResult } from "./read.ts"
import { writeResult } from "./write.ts"

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
export interface ToolResultProps<T extends Tool = Tool> {
  params?: Partial<ParamsOf<T>>
  call: ToolCallPart
  /** Reactive — `undefined` while in flight, then the resolved
   *  `ToolResult` when the tool returns. */
  result: Accessor<ToolResult | undefined>
}

export type ToolResultRenderer<T extends Tool = Tool> = Widget<ToolResultProps<T>>

// Loaders are thunks so the registry shape (`(opts) => V`) matches —
// `void` opts, value is the renderer. This lets plugins register their
// own via `toolResultRegistry.register("my-tool", () => myRenderer)` at
// runtime, and leaves the door open for lazy `import()` loaders later
// without breaking the call site.
const builtin = {
  bash: () => bashResult,
  read: () => readResult,
  write: () => writeResult,
} as const satisfies Record<string, () => ToolResultRenderer>

export const toolResultRegistry = createRegistry<ToolResultRenderer>("tool-result").from(builtin)

/** Dispatcher widget — picks a renderer by `call.name` and falls back
 *  to the generic default. Plugins extend the registry; this widget
 *  doesn't need to change as new renderers land. */
export const toolResult = widget((props: ToolResultProps) => {
  const renderer = toolResultRegistry.has(props.call.name)
    ? toolResultRegistry.load(props.call.name)
    : defaultResult
  return renderer(props)
})

export { bashResult, defaultResult, readResult, writeResult }
