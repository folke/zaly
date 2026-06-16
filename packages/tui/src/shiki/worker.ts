// oxlint-disable no-await-in-loop
import type { ShikiResult, ShikiWorkerRequest } from "./types.ts"

import { shiki } from "./api.ts"

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
    post(await highlight(req))
    await Promise.resolve() // yield to event loop between requests
  }
}

async function handle(job: ShikiWorkerRequest): Promise<void> {
  queue.push(job)
  running ??= run().finally(() => {
    running = undefined
  })
}

function post(result: ShikiResult): void {
  if (typeof globalThis.postMessage === "function") {
    // oxlint-disable-next-line unicorn/require-post-message-target-origin
    globalThis.postMessage(result)
    return
  }
  void import("node:worker_threads").then(({ parentPort }) => {
    // oxlint-disable-next-line unicorn/require-post-message-target-origin
    parentPort?.postMessage(result)
  })
}

function listenWebWorker(): boolean {
  if (typeof globalThis.addEventListener !== "function") return false
  globalThis.addEventListener("message", (event: MessageEvent<ShikiWorkerRequest>) => {
    void handle(event.data)
  })
  return true
}

if (!listenWebWorker()) {
  const { parentPort } = await import("node:worker_threads")
  parentPort?.on("message", (message: ShikiWorkerRequest) => {
    void handle(message)
  })
}
