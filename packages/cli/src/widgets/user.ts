import { text, widget } from "@zaly/tui"
import { bubble } from "./bubble.ts"

/** Single user-turn bubble. Static once committed — plain string content
 *  is enough; the closure-reactivity hooks aren't needed here. */
export const userMessage = widget((props: { content: string }) =>
  bubble({ type: "user" }, text(props.content))
)
