import type { AgentEvent, AgentStatus } from "../src/events.ts"

import { describe, expect, test } from "vitest"
import { Emitter } from "../src/events.ts"

type FakeEvent = { type: "status"; status: AgentStatus } | { type: "message"; text: string }

class FakeEmitter extends Emitter {
  fire(event: FakeEvent): void {
    this.emit(event as AgentEvent)
  }
}

describe("Emitter", () => {
  test("on(handler) receives every event", () => {
    const seen: FakeEvent["type"][] = []
    const e = new FakeEmitter()
    e.on((event) => seen.push(event.type as FakeEvent["type"]))
    e.fire({ status: "idle", type: "status" })
    e.fire({ text: "hi", type: "message" })
    expect(seen).toEqual(["status", "message"])
  })

  test("on(type, handler) is narrowed and skips other types", () => {
    let captured: AgentStatus | undefined
    const e = new FakeEmitter()
    e.on("status", (event) => {
      captured = event.status
    })
    e.fire({ text: "ignored", type: "message" })
    e.fire({ status: "streaming", type: "status" })
    expect(captured).toBe("streaming")
  })

  test("on returns an unsubscribe function", () => {
    let count = 0
    const e = new FakeEmitter()
    const off = e.on("message", () => count++)
    e.fire({ text: "a", type: "message" })
    off()
    e.fire({ text: "b", type: "message" })
    expect(count).toBe(1)
  })

  test("once fires exactly one matching event", () => {
    let count = 0
    const e = new FakeEmitter()
    e.once("message", () => count++)
    e.fire({ text: "a", type: "message" })
    e.fire({ text: "b", type: "message" })
    expect(count).toBe(1)
  })

  test("off removes a previously-registered handler", () => {
    let count = 0
    const handler = (): void => {
      count++
    }
    const e = new FakeEmitter()
    e.on("message", handler)
    e.fire({ text: "a", type: "message" })
    e.off(handler)
    e.fire({ text: "b", type: "message" })
    expect(count).toBe(1)
  })

  test("a throwing listener does not break the emitter and reports via onEmitError", () => {
    let count = 0
    const errors: unknown[] = []
    const e = new FakeEmitter()
    e.onEmitError = (err) => errors.push(err)
    e.on(() => {
      throw new Error("boom")
    })
    e.on(() => count++)
    e.fire({ text: "a", type: "message" })
    expect(count).toBe(1)
    expect(errors).toHaveLength(1)
    expect((errors[0] as Error).message).toBe("boom")
  })
})
