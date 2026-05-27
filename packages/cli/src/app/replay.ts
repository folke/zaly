import type { Message } from "@zaly/ai"
import type { Renderer } from "@zaly/tui"

import { overlay } from "@zaly/tui"
import { messageWidgets } from "./message.ts"

export async function replay(messages: readonly Message[], renderer: Renderer) {
  const nodes = messageWidgets(messages).flatMap(({ widgets }) => widgets)
  const len = 8
  const tail = nodes.slice(-len)

  const over = renderer.overlay
    .add(() =>
      overlay(
        {
          height: renderer.terminal.rows - renderer.ui.height,
          verticalAlign: "bottom",
          width: renderer.terminal.cols,
          x: 0,
          y: 1,
        },
        ...tail.map((node) => node())
      )
    )
    .show()

  await renderer.render()
  for (const node of nodes) renderer.stream.append(node)
  await renderer.stream.waitIdle()
  renderer.overlay.remove(over)
}
