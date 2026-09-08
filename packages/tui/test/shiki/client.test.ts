import type { ShikiWorkerRequest } from "../../src/shiki/types.ts"

import { afterEach, expect, test, vi } from "vitest"
import { ShikiWorkerClient } from "../../src/shiki/client.ts"

const originalWorker = Object.getOwnPropertyDescriptor(globalThis, "Worker")

afterEach(() => {
  vi.restoreAllMocks()
  if (originalWorker) Object.defineProperty(globalThis, "Worker", originalWorker)
  else Reflect.deleteProperty(globalThis, "Worker")
})

function installWorker(
  postMessage: (message: ShikiWorkerRequest, emit: (result: unknown) => void) => void
): void {
  class FakeWorker {
    #message?: (event: { data: unknown }) => void

    addEventListener(event: string, handler: (event: { data: unknown }) => void): void {
      if (event === "message") {
        this.#message = handler
        queueMicrotask(() => this.#message?.({ data: { type: "ready" } }))
      }
    }

    postMessage(message: ShikiWorkerRequest): void {
      postMessage(message, (result) => this.#message?.({ data: result }))
    }

    terminate(): void {}
    unref(): void {}
  }

  Object.defineProperty(globalThis, "Worker", {
    configurable: true,
    value: FakeWorker,
    writable: true,
  })
}

test("rejects and reports worker send failures", async () => {
  installWorker(() => {
    throw new Error("send failed")
  })
  const report = vi.spyOn(console, "error").mockImplementation(() => {})
  const client = new ShikiWorkerClient()

  await expect(client.highlight("const answer = 42", "typescript")).rejects.toThrow("send failed")
  expect(report).toHaveBeenCalledWith("Shiki worker failed:", expect.any(Error))
})

test("rejects and reports a worker that stops responding", async () => {
  installWorker(() => {})
  const report = vi.spyOn(console, "error").mockImplementation(() => {})
  const client = new ShikiWorkerClient({ timeout: 10 })

  await expect(client.highlight("const answer = 42", "typescript")).rejects.toThrow(
    "timed out after 10ms"
  )
  expect(report).toHaveBeenCalledWith("Shiki worker failed:", expect.any(Error))
})

test("rejects and reports highlighting errors returned by the worker", async () => {
  installWorker((message, emit) => {
    queueMicrotask(() =>
      emit({ error: "highlight failed", id: message.id, type: "result", value: message.code })
    )
  })
  const report = vi.spyOn(console, "error").mockImplementation(() => {})
  const client = new ShikiWorkerClient()

  await expect(client.highlight("const answer = 42", "typescript")).rejects.toThrow(
    "highlight failed"
  )
  expect(report).toHaveBeenCalledWith("Shiki highlighting failed:", expect.any(Error))
})
