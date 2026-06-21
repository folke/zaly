import type { Session } from "@zaly/agent/session"
import type { App } from "./app.ts"

import { messageWidgets } from "./message.ts"

const REPLAY_LIMIT = 100
const STICKY_TAIL = 20

/** Replay the conversation history for the current session, up to a certain limit. */
export async function replay(session: Session, app: App) {
  const reasoning = app.settings.ui.reasoning

  const messages = session.messages.filter((m) => !m.hidden).slice(-REPLAY_LIMIT)
  if (messages.length === 0) return

  const tail = messageWidgets(messages.slice(-STICKY_TAIL), {
    composer: app.composer,
    pending: true,
    reasoning,
  })

  const tailWidgets = tail.flatMap(({ widgets }) => widgets)

  const nodes = messageWidgets(messages.slice(0, -STICKY_TAIL), {
    composer: app.composer,
    pending: false,
    reasoning,
  }).flatMap(({ widgets }) => widgets)

  // Render the tail first with sticky:true, so that the end state is visible immediately
  for (const node of tailWidgets) app.renderer.stream.append(node)

  // Give the renderer some time to flush initial render
  await new Promise((resolve) => setImmediate(resolve))

  // Now stream all the other nodes and yield to the event loop between each append,
  // so that the UI doesn't block
  for (const node of nodes) {
    app.renderer.stream.append(node)
    // oxlint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setImmediate(resolve))
  }

  // Wait for render so that pending states are still at the bottom
  await app.renderer.render()

  // Flush pending nodes in the stream
  for (const { setPending } of tail) setPending?.(false)

  // Wait for final render so that pending states update in the UI
  await app.renderer.render()

  // Wait till all rendering is idle
  await app.renderer.stream.waitIdle()
}
