import { createRenderer } from "@zaly/tui"

const renderer = await createRenderer()
renderer.start()

const t = renderer.terminal

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

await sleep(2000)
t.setProgress("loading")
await sleep(2000)

t.setProgress("error")
await sleep(2000)
//
t.setProgress("paused")
await sleep(2000)

t.setProgress("loading")
await sleep(2000)

console.log("done")
t.stop()
