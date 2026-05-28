import type { Accessor, Reactive } from "@zaly/tui"

import { markdown } from "@zaly/tui/widgets/markdown"
import { widget } from "@zaly/tui/widgets/widget"
import { bubble } from "./bubble.ts"

/** Assistant bubble. Live-streaming usage passes a `Reactive<string>`
 *  (signal accessor) so deltas re-render the markdown body in place;
 *  resumed messages pass a plain string. Both flow through `markdown`. */
export const assistantMessage = widget(
  (props: { content: Reactive<string>; pending?: Accessor<boolean> }) =>
    bubble({ pending: props.pending, type: "assistant" }, markdown(props.content))
)
