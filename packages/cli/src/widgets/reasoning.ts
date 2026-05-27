import type { Accessor, Reactive } from "@zaly/tui"

import { markdown, widget } from "@zaly/tui"
import { bubble } from "./bubble.ts"

/**
 * A streaming-capable reasoning bubble. Distinct visual treatment from
 * `assistantMessage` (dimmed, plain text rather than markdown) so the
 * user can scan reasoning vs reply at a glance.
 *
 * Plain `text` (not `markdown`) on purpose: reasoning streams are usually
 * flowing prose, often half-formed; running them through a markdown
 * parser per token makes mid-stream output flicker. Word-wrap is enough.
 *
 * The `content` prop is `Reactive<string>` — pass a signal so each
 * delta-driven write re-renders only this bubble (not the whole stream).
 */

export const reasoningMessage = widget(
  (props: { content: Reactive<string>; pending?: Accessor<boolean> }) =>
    bubble(
      {
        pending: props.pending,
        style: { dim: true, italic: true, style: "quiet" },
        type: "reasoning",
      },
      markdown(props.content)
    )
)
