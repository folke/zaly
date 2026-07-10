import { expect, test } from "vitest"
import { createWorker } from "../../src/shiki/worker.ts"

test("unrefs the worker after registering a listener", async () => {
  const calls: string[] = []
  const original = Object.getOwnPropertyDescriptor(globalThis, "Worker")

  class FakeWorker {
    addEventListener(event: string): void {
      calls.push(`on:${event}`)
    }

    postMessage(): void {}
    terminate(): void {}

    unref(): void {
      calls.push("unref")
    }
  }

  Object.defineProperty(globalThis, "Worker", {
    configurable: true,
    value: FakeWorker,
    writable: true,
  })

  try {
    const worker = await createWorker()
    worker.on("message", () => {})
    expect(calls).toEqual(["unref", "on:message", "unref"])
  } finally {
    if (original) Object.defineProperty(globalThis, "Worker", original)
    else Reflect.deleteProperty(globalThis, "Worker")
  }
})
