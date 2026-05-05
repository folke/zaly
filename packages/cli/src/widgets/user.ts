import { box, markdown, widget } from "@zaly/tui"

/** Single user-turn bubble. Static once committed — plain string content
 *  is enough; the closure-reactivity hooks aren't needed here. */
export const userMessage = widget((props: { content: string }) =>
  box({ padding: [1, 1, 0, 1] }, markdown(`**you:** ${props.content}`))
)
