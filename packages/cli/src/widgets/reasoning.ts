import type { Accessor, Reactive } from "@zaly/tui"

import { memo, unwrap } from "@zaly/tui"
import { markdown } from "@zaly/tui/widgets/markdown"
import { widget } from "@zaly/tui/widgets/widget"
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

export function stripReasoningMarkers(text: string): string {
  return text.replaceAll("<!-- -->", "").trim()
}

export const reasoningMessage = widget(
  (props: { content: Reactive<string>; pending?: Accessor<boolean> }) =>
    bubble(
      {
        pending: props.pending,
        style: "quiet",
        type: "reasoning",
      },
      markdown(memo(() => stripReasoningMarkers(unwrap(props.content))))
    )
)
