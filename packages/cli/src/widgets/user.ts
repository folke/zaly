import { box, markdown } from "@zaly/tui"

export function userMessage(content: string): ReturnType<typeof box> {
  return box({ padding: [1, 1, 0, 1] }, markdown(`**you:** ${content}`))
}
