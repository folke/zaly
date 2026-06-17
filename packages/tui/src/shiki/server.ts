// oxlint-disable no-await-in-loop
import type { ShikiResult, ShikiWorkerRequest } from "./types.ts"

import { shiki } from "./api.ts"
import { workerHost } from "./worker.ts"

async function highlight(job: ShikiWorkerRequest): Promise<ShikiResult> {
  try {
    const value = await shiki.highlight(job.code, job.lang, job.theme)
    return { id: job.id, value }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      id: job.id,
      value: job.code,
    }
  }
}

const queue: ShikiWorkerRequest[] = []

let running: Promise<void> | undefined = undefined

async function run(): Promise<void> {
  // Serialize processing to not block the event loop with multiple concurrent highlights.
  while (queue.length) {
    // We do LIFO on purpose so that the visible code blocks are rendered first (last stream nodes)
    const req = queue.pop()!
    // oxlint-disable-next-line unicorn/require-post-message-target-origin
    workerHost.postMessage(await highlight(req))
    await Promise.resolve() // yield to event loop between requests
  }
}

async function handle(job: ShikiWorkerRequest): Promise<void> {
  queue.push(job)
  running ??= run().finally(() => {
    running = undefined
  })
}

workerHost.onMessage((message: ShikiWorkerRequest) => handle(message))
