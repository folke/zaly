import type { Accessor, Reactive } from "@zaly/tui"

import { markdown, widget } from "@zaly/tui"
import { bubble } from "./bubble.ts"

/** Assistant bubble. Live-streaming usage passes a `Reactive<string>`
 *  (signal accessor) so deltas re-render the markdown body in place;
 *  resumed messages pass a plain string. Both flow through `markdown`. */
export const assistantMessage = widget(
  (props: { content: Reactive<string>; pending?: Accessor<boolean> }) =>
    bubble({ pending: props.pending, type: "assistant" }, markdown(props.content))
)
