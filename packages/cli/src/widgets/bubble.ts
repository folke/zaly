import type { AnyStyle, Node, Reactive } from "@zaly/tui"

import { box, text, unwrap, widget } from "@zaly/tui"

type Bubble = {
  icon: string
  style: AnyStyle
  highlight?: AnyStyle
}

const bubbles = {
  assistant: { icon: "●", style: "white" },
  reasoning: { icon: "∴", style: "quiet" },
  tool_error: { icon: "●", style: "error" },
  tool_pending: { icon: "●", style: "muted" },
  tool_success: { icon: "●", style: "success" },
  user: { highlight: "highlight", icon: "●", style: "primary" },
} as const satisfies Record<string, Bubble>

export type BubbleType = keyof typeof bubbles

export type BubbleProps = {
  type: Reactive<BubbleType>
  style?: AnyStyle
}

export const bubble = widget((props: BubbleProps & { children: readonly Node[] }) => {
  const b = bubbles[unwrap(props.type)] as Bubble
  const tvpad = b.highlight ? 1 : 0
  return box(
    { padding: [1, 0, 0, 0], width: "fill" },
    box(
      { flexDirection: "row", padding: [tvpad, 0, tvpad, 1], style: b.highlight, width: "fill" },
      text(({ style }) => style.add(b.style)(b.icon)),
      box({ flexDirection: "column", padding: [0, 1], style: props.style }, ...props.children)
    )
  )
})
