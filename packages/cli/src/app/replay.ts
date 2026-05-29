import type { Message } from "@zaly/ai"
import type { App } from "./app.ts"

import { messageWidgets } from "./message.ts"

const TAIL = 10

export async function replay(messages: readonly Message[], app: App) {
  const renderer = app.renderer

  const tail = messageWidgets(messages.slice(-TAIL), {
    composer: app.composer,
    pending: true,
  })

  const tailWidgets = tail.flatMap(({ widgets }) => widgets)

  const nodes = messageWidgets(messages.slice(0, -TAIL), {
    composer: app.composer,
    pending: false,
  }).flatMap(({ widgets }) => widgets)

  // Render the tail first with sticky:true, so that the end state is visible immediately
  for (const node of tailWidgets) renderer.stream.append(node)

  // Give the renderer some time to flush initial render
  await new Promise((resolve) => setImmediate(resolve))

  // Now stream all the other nodes and yield to the event loop between each append,
  // so that the UI doesn't block
  for (const node of nodes) {
    renderer.stream.append(node)
    // oxlint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setImmediate(resolve))
  }

  // Wait for render so that pending states are still at the bottom
  await renderer.render()

  // Flush pending nodes in the stream
  for (const { setPending } of tail) setPending?.(false)

  // Wait for final render so that pending states update in the UI
  await renderer.render()

  // Wait till all rendering is idle
  await renderer.stream.waitIdle()
}
