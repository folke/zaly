import type { Reactive } from "@zaly/tui"

import { spinner, box, text, unwrap } from "@zaly/tui"

export interface StatuslineProps {
  busy: Reactive<boolean>
  model: Reactive<string>
  status: Reactive<string>
}

/**
 * Single-line status: spinner · zaly · model · status. Each `Reactive<T>`
 * is unwrapped inside the text closure so signals auto-subscribe at
 * render time — change a signal, only this line re-renders.
 */
export function statusline(props: StatuslineProps): ReturnType<typeof box> {
  return box(
    { flexDirection: "row", gap: 1 },
    spinner({ color: "accent", running: props.busy }),
    text(
      ({ style }) =>
        `${style.primary.bold("zaly")} ${style.dim("·")} ${style.success(unwrap(props.model))} ${style.dim("·")} ${style.accent(unwrap(props.status))}`
    )
  )
}
