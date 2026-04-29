import type { AgentStatus } from "../src/events.ts"

import { describe, expect, test } from "vitest"
import { Emitter } from "../src/events.ts"

type FakeEvents = {
  status: { status: AgentStatus }
  message: { text: string }
}

class FakeEmitter extends Emitter<FakeEvents> {}

describe("Emitter", () => {
  test("on(type, handler) is narrowed to the event payload", () => {
    let captured: AgentStatus | undefined
    const e = new FakeEmitter()
    e.on("status", (event) => {
      captured = event.status
    })
    e.emit("message", { text: "ignored" })
    e.emit("status", { status: "streaming" })
    expect(captured).toBe("streaming")
  })

  test("listener receives the emitter as second arg (polymorphic this)", () => {
    let captured: FakeEmitter | undefined
    const e = new FakeEmitter()
    e.on("status", (_event, self) => {
      captured = self
    })
    e.emit("status", { status: "idle" })
    expect(captured).toBe(e)
  })

  test("once fires exactly one matching event", () => {
    let count = 0
    const e = new FakeEmitter()
    e.once("message", () => count++)
    e.emit("message", { text: "a" })
    e.emit("message", { text: "b" })
    expect(count).toBe(1)
  })

  test("off removes a previously-registered handler", () => {
    let count = 0
    const handler = (): void => {
      count++
    }
    const e = new FakeEmitter()
    e.on("message", handler)
    e.emit("message", { text: "a" })
    e.off("message", handler)
    e.emit("message", { text: "b" })
    expect(count).toBe(1)
  })

  test("a throwing listener does not break the emitter and reports via onEmitError", () => {
    let count = 0
    const errors: unknown[] = []
    const e = new FakeEmitter()
    e.onEmitError = (err) => errors.push(err)
    e.on("message", () => {
      throw new Error("boom")
    })
    e.on("message", () => count++)
    e.emit("message", { text: "a" })
    expect(count).toBe(1)
    expect(errors).toHaveLength(1)
    expect((errors[0] as Error).message).toBe("boom")
  })
})
