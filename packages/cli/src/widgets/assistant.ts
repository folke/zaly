import type { Reactive } from "@zaly/tui"

import { box, markdown, widget } from "@zaly/tui"

/** A streaming-capable assistant bubble. Pass a `Reactive<string>`
 *  (typically a signal accessor) for `content` so the markdown re-parses
 *  on each render as deltas arrive. Plain string also works for static
 *  resumed-message rendering. */
export const assistantMessage = widget((props: { content: Reactive<string> }) =>
  box({ padding: [1, 1, 0, 1] }, markdown(props.content, { wrap: "word" }))
)
