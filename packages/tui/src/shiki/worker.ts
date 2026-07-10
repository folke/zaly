// oxlint-disable typescript/method-signature-style unicorn/require-post-message-target-origin
import type { MaybePromise } from "@zaly/shared"

export const workerHost = {
  onMessage: (handler: (message: any) => MaybePromise): void => {
    if (typeof globalThis.addEventListener === "function") {
      globalThis.addEventListener("message", (event: MessageEvent) => void handler(event.data))
      return
    }
    void import("node:worker_threads").then(({ parentPort }) => {
      parentPort?.on("message", (message) => void handler(message))
    })
  },

  postMessage: (message: unknown): void => {
    if (typeof globalThis.postMessage === "function") {
      // oxlint-disable-next-line unicorn/require-post-message-target-origin
      globalThis.postMessage(message)
      return
    }
    void import("node:worker_threads").then(({ parentPort }) => {
      // oxlint-disable-next-line unicorn/require-post-message-target-origin
      parentPort?.postMessage(message)
    })
  },
}

export type WorkerInstance<In = unknown, Out = unknown> = {
  on(event: "message", handler: (message: Out) => MaybePromise): void
  on(event: "error", handler: (error: Error) => MaybePromise): void
  postMessage(message: In): void
  terminate(): void
}

export async function createWorker<In = unknown, Out = unknown>(): Promise<
  WorkerInstance<In, Out>
> {
  const scriptURL = new URL(import.meta.resolve("#shiki-worker"))
  if (typeof globalThis.Worker === "function") {
    const w = new Worker(scriptURL, { type: "module" })
    // oxlint-disable-next-line typescript/no-unnecessary-condition
    w.unref?.()
    return {
      on: (event, handler) => {
        if (event === "error")
          w.addEventListener(event, (e) => void handler(e.error ?? new Error(e.message)))
        else w.addEventListener(event, (e) => void handler(e.data))
        // Registering a listener can re-reference the worker.
        // oxlint-disable-next-line typescript/no-unnecessary-condition
        w.unref?.()
      },
      postMessage: (message) => w.postMessage(message),
      terminate: () => w.terminate(),
    }
  }
  const { Worker: NodeWorker } = await import("node:worker_threads")
  const worker = new NodeWorker(scriptURL)
  worker.unref()
  return {
    on: (event, handler) => {
      worker.on(event, (e) => void handler(e))
      // Registering a listener re-references the worker's MessagePort.
      worker.unref()
    },
    postMessage: (message) => worker.postMessage(message),
    terminate: () => void worker.terminate(),
  }
}
