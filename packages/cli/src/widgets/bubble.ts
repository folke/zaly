import type { Accessor, AnyStyle, Node, Reactive, Ref, State } from "@zaly/tui"
import type { Box, BoxStyle } from "@zaly/tui/widgets/box"

import { effect, memo, unwrap } from "@zaly/tui"
import { box } from "@zaly/tui/widgets/box"
import { show } from "@zaly/tui/widgets/show"
import { spinner } from "@zaly/tui/widgets/spinner"
import { text } from "@zaly/tui/widgets/text"
import { widget } from "@zaly/tui/widgets/widget"

type Bubble = {
  icon: string
  style: AnyStyle
  highlight?: AnyStyle
  spinner?: boolean
}

const bubbles = {
  assistant: { icon: "●", style: "white" },
  permission: { icon: "●", spinner: true, style: "warn" },
  reasoning: { icon: "∴", style: "quiet" },
  tool_error: { icon: "●", style: "error" },
  tool_pending: { icon: "●", spinner: true, style: "info" },
  tool_success: { icon: "●", style: "success" },
  user: { highlight: "highlight", icon: "❯", style: "primary" },
} as const satisfies Record<string, Bubble>

export type BubbleType = keyof typeof bubbles

export type BubbleProps = {
  type: Reactive<BubbleType>
  pending?: Accessor<boolean>
  style?: AnyStyle
  childrenBox?: Ref<Box>
  box?: State<BoxStyle>
}

export const bubble = widget((props: BubbleProps, ...children: readonly Node[]) => {
  const b = memo(() => bubbles[unwrap(props.type)] as Bubble)
  const spin = memo(() => b().spinner ?? unwrap(props.pending) ?? false)
  const tvpad = b().highlight ? 1 : 0
  const ret = box(
    { padding: [1, 0, 0, 0], width: "fill", ...props.box },
    box(
      { flexDirection: "row", padding: [tvpad, 0, tvpad, 1], style: b().highlight, width: "fill" },
      show(
        {
          use: () =>
            spinner({
              color: memo(() => b().style),
              frames: "circle",
              running: spin,
            }),
          when: spin,
        },
        () => text(({ style }) => style.add(b().style)(b().icon))
      ),
      box(
        { flexDirection: "column", padding: [0, 1], style: props.style, width: "fill" },
        ...children
      ).ref(props.childrenBox)
    )
  )
  effect(() => {
    ret.state.sticky = unwrap(props.pending) ?? false
  })
  return ret
})
