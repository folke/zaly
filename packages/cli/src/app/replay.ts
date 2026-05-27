import type { Message } from "@zaly/ai"
import type { App } from "./app.ts"

import { overlay } from "@zaly/tui"
import { messageWidgets } from "./message.ts"

const OVERLAY = false

export async function replay(messages: readonly Message[], app: App) {
  const renderer = app.renderer
  const nodes = messageWidgets(messages, {
    format: app.composer.formatter,
    pending: false,
  }).flatMap(({ widgets }) => widgets)
  const len = 8
  const tail = nodes.slice(-len)

  // oxlint-disable-next-line typescript/no-unnecessary-condition
  const over = OVERLAY
    ? renderer.overlay
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
    : undefined

  for (const node of nodes) renderer.stream.append(node)
  await renderer.render()
  await renderer.stream.waitIdle()
  if (over) {
    renderer.overlay.remove(over)
  }
}
