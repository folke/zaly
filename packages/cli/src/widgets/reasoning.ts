import type { Reactive } from "@zaly/tui"

import { box, text, unwrap, widget } from "@zaly/tui"

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
export const reasoningMessage = widget((props: { content: Reactive<string> }) =>
  box(
    { padding: [1, 1, 0, 1] },
    text(
      ({ style }) => {
        const c = unwrap(props.content)
        return c === "" ? "" : style.dim(c)
      },
      { wrap: "word" }
    )
  )
)
