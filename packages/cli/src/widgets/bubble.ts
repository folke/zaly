import type { AnyStyle, Node, Reactive } from "@zaly/tui"

import { box, text, unwrap, widget } from "@zaly/tui"

type Bubble = {
  icon: string
  style: AnyStyle
  bg?: AnyStyle
}

const bubbles = {
  assistant: { icon: "●", style: "white" },
  reasoning: { icon: "∴", style: "quiet" },
  tool_error: { icon: "●", style: "error" },
  tool_pending: { icon: "●", style: "muted" },
  tool_success: { icon: "●", style: "success" },
  user: { icon: "●", style: "primary" },
} as const satisfies Record<string, Bubble>

export type BubbleType = keyof typeof bubbles

export type BubbleProps = {
  type: Reactive<BubbleType>
  style?: AnyStyle
}

export const bubble = widget((props: BubbleProps & { children: readonly Node[] }) =>
  box(
    { flexDirection: "row", padding: [1, 0, 0, 0], width: "fit" },
    text(({ style }) => {
      const b = bubbles[unwrap(props.type)]
      return style.add(b.style)(b.icon)
    }),
    box({ flexDirection: "column", padding: [0, 1], style: props.style }, ...props.children)
  )
)
