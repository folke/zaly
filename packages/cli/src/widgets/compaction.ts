import { box } from "@zaly/tui/widgets/box"
import { text } from "@zaly/tui/widgets/text"
import { widget } from "@zaly/tui/widgets/widget"

/** Visual marker rendered into the stream when a compaction completes.
 *  The agent's active chain has been replaced with `[summary, ...kept_tail]`
 *  internally; the existing scrollback above this marker reflects the
 *  pre-compact conversation, future messages render after it. */
export const compactionMarker = widget(() =>
  box(
    { padding: [1, 1, 0, 1] },
    text(({ style }) => style.dim(`─── context compacted ───`))
  )
)
