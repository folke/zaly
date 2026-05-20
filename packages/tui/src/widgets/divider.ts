import type { Style } from "../style/types.ts"
import type { Text } from "./text.ts"

import { text } from "./text.ts"

export type DividerState = Style & {
  char?: string
  length?: number
}

export function divider(state: DividerState = { style: "accent" }): Text {
  return text((ctx) => (state.char ?? "─").repeat(state.length ?? ctx.width), state)
}
