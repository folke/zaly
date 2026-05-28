import type { Message } from "@zaly/ai"
import type { App } from "./app.ts"

import { messageWidgets } from "./message.ts"

export async function replay(messages: readonly Message[], app: App) {
  const renderer = app.renderer
  const nodes = messageWidgets(messages, {
    composer: app.composer,
    pending: false,
  }).flatMap(({ widgets }) => widgets)

  for (const node of nodes) renderer.stream.append(node)
  await renderer.render()
  await renderer.stream.waitIdle()
}
