// oxlint-disable no-await-in-loop
import type { ShikiJob, ShikiResult, ShikiWorkerRequest, ShikiWorkerResponse } from "./types.ts"

import { shiki } from "./api.ts"

async function highlight(job: ShikiJob): Promise<ShikiResult> {
  try {
    const value = await shiki.highlight(job.code, job.lang, job.theme)
    return { key: job.key, value }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      key: job.key,
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
    const results: ShikiResult[] = []
    for (const job of req.jobs) {
      const result = await highlight(job)
      results.push(result)
    }
    post({ id: req.id, results })
    await Promise.resolve() // yield to event loop between requests
  }
}

async function handle(message: ShikiWorkerRequest): Promise<void> {
  queue.push(message)
  running ??= run().finally(() => {
    running = undefined
  })
}

function post(message: ShikiWorkerResponse): void {
  if (typeof globalThis.postMessage === "function") {
    // oxlint-disable-next-line unicorn/require-post-message-target-origin
    globalThis.postMessage(message)
    return
  }
  void import("node:worker_threads").then(({ parentPort }) => {
    // oxlint-disable-next-line unicorn/require-post-message-target-origin
    parentPort?.postMessage(message)
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
