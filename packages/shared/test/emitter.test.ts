import { describe, expect, test, vi } from "vitest"
import { Emitter } from "../src/emitter.ts"

type Events = {
  foo: { value: number }
  bar: { name: string }
  ready: {}
  hook: { messages: number[] }
  cancelable: { signal?: AbortSignal; touched?: boolean }
}

const next = () => new Promise<void>((r) => queueMicrotask(r))

describe("Emitter — basics", () => {
  test("on/emit/off — typed payload", async () => {
    const e = new Emitter<Events>()
    const seen: number[] = []
    e.on("foo", (ev) => {
      seen.push(ev.value)
    })
    await e.emit("foo", { value: 1 })
    await e.emit("foo", { value: 2 })
    expect(seen).toEqual([1, 2])
  })

  test("emit with no-data event omits args", async () => {
    const e = new Emitter<Events>()
    const spy = vi.fn()
    e.on("ready", spy)
    await e.emit("ready")
    expect(spy).toHaveBeenCalledOnce()
  })

  test("off stops further deliveries", async () => {
    const e = new Emitter<Events>()
    const spy = vi.fn()
    e.on("foo", spy)
    await e.emit("foo", { value: 1 })
    e.off("foo", spy)
    await e.emit("foo", { value: 2 })
    expect(spy).toHaveBeenCalledOnce()
  })

  test("once fires exactly once and self-removes", async () => {
    const e = new Emitter<Events>()
    const spy = vi.fn()
    e.once("foo", spy)
    await e.emit("foo", { value: 1 })
    await e.emit("foo", { value: 2 })
    expect(spy).toHaveBeenCalledOnce()
  })

  test("off works with the original ref after once()", async () => {
    const e = new Emitter<Events>()
    const fn = vi.fn()
    e.once("foo", fn)
    e.off("foo", fn) // before firing
    await e.emit("foo", { value: 1 })
    expect(fn).not.toHaveBeenCalled()
  })

  test("set dedupe — registering same fn twice fires once", async () => {
    const e = new Emitter<Events>()
    const spy = vi.fn()
    e.on("foo", spy)
    e.on("foo", spy)
    await e.emit("foo", { value: 1 })
    expect(spy).toHaveBeenCalledOnce()
  })

  test("listener order matches registration order (serial)", async () => {
    const e = new Emitter<Events>()
    const seen: string[] = []
    e.on("foo", () => {
      seen.push("a")
    })
    e.on("foo", () => {
      seen.push("b")
    })
    e.on("foo", () => {
      seen.push("c")
    })
    await e.emitSerial("foo", { value: 1 })
    expect(seen).toEqual(["a", "b", "c"])
  })

  test("emit returns true when no listeners registered", async () => {
    const e = new Emitter<Events>()
    expect(await e.emit("foo", { value: 1 })).toBe(true)
  })

  test("emit returns true when all listeners complete", async () => {
    const e = new Emitter<Events>()
    e.on("foo", () => {})
    expect(await e.emit("foo", { value: 1 })).toBe(true)
  })
})

describe("Emitter — onAny", () => {
  test("onAny fires for every event with envelope", async () => {
    const e = new Emitter<Events>()
    const seen: Array<{ type: string }> = []
    e.onAny((ev) => {
      seen.push({ type: ev.type })
    })
    await e.emit("foo", { value: 1 })
    await e.emit("bar", { name: "x" })
    await e.emit("ready")
    expect(seen.map((s) => s.type)).toEqual(["foo", "bar", "ready"])
  })

  test("onAny fires before typed listeners", async () => {
    const e = new Emitter<Events>()
    const seen: string[] = []
    e.on("foo", () => {
      seen.push("typed")
    })
    e.onAny(() => {
      seen.push("any")
    })
    await e.emitSerial("foo", { value: 1 })
    expect(seen).toEqual(["any", "typed"])
  })

  test("offAny removes the wildcard listener", async () => {
    const e = new Emitter<Events>()
    const spy = vi.fn()
    e.onAny(spy)
    await e.emit("foo", { value: 1 })
    e.offAny(spy)
    await e.emit("foo", { value: 2 })
    expect(spy).toHaveBeenCalledOnce()
  })
})

describe("Emitter — signal-bound listeners", () => {
  test("aborting the signal removes the listener", async () => {
    const e = new Emitter<Events>()
    const ctrl = new AbortController()
    const spy = vi.fn()
    e.on("foo", spy, { signal: ctrl.signal })
    await e.emit("foo", { value: 1 })
    ctrl.abort()
    await e.emit("foo", { value: 2 })
    expect(spy).toHaveBeenCalledOnce()
  })

  test("registering with an already-aborted signal is a no-op", async () => {
    const e = new Emitter<Events>()
    const ctrl = new AbortController()
    ctrl.abort()
    const spy = vi.fn()
    e.on("foo", spy, { signal: ctrl.signal })
    await e.emit("foo", { value: 1 })
    expect(spy).not.toHaveBeenCalled()
  })

  test("signal-bound once removes both wrapper and entry", async () => {
    const e = new Emitter<Events>()
    const ctrl = new AbortController()
    const spy = vi.fn()
    e.once("foo", spy, { signal: ctrl.signal })
    ctrl.abort()
    await e.emit("foo", { value: 1 })
    expect(spy).not.toHaveBeenCalled()
  })

  test("signal-bound onAny is cleaned up on abort", async () => {
    const e = new Emitter<Events>()
    const ctrl = new AbortController()
    const spy = vi.fn()
    e.onAny(spy, { signal: ctrl.signal })
    await e.emit("foo", { value: 1 })
    ctrl.abort()
    await e.emit("foo", { value: 2 })
    expect(spy).toHaveBeenCalledOnce()
  })
})

describe("Emitter — parallel emit (default)", () => {
  test("listeners run concurrently", async () => {
    const e = new Emitter<Events>()
    const order: string[] = []
    e.on("foo", async () => {
      await new Promise((r) => setTimeout(r, 30))
      order.push("slow")
    })
    e.on("foo", async () => {
      await new Promise((r) => setTimeout(r, 5))
      order.push("fast")
    })
    await e.emit("foo", { value: 1 })
    // Parallel → fast finishes before slow despite registration order
    expect(order).toEqual(["fast", "slow"])
  })

  test("one listener throwing doesn't break the others (sync throw)", async () => {
    const e = new Emitter<Events>()
    const errors: unknown[] = []
    e.onEmitError = (err) => errors.push(err)
    const spy = vi.fn()
    e.on("foo", () => {
      throw new Error("boom")
    })
    e.on("foo", spy)
    const ok = await e.emit("foo", { value: 1 })
    expect(spy).toHaveBeenCalledOnce()
    expect(errors).toHaveLength(1)
    expect((errors[0] as Error).message).toBe("boom")
    // No listener called ctx.abort, so emit completed
    expect(ok).toBe(true)
  })

  test("one listener rejecting doesn't break the others (async)", async () => {
    const e = new Emitter<Events>()
    const errors: unknown[] = []
    e.onEmitError = (err) => errors.push(err)
    const spy = vi.fn()
    e.on("foo", async () => {
      throw new Error("async boom")
    })
    e.on("foo", spy)
    await e.emit("foo", { value: 1 })
    expect(spy).toHaveBeenCalledOnce()
    expect(errors).toHaveLength(1)
  })

  test("missing onEmitError swallows silently", async () => {
    const e = new Emitter<Events>()
    e.on("foo", () => {
      throw new Error("silent")
    })
    // Should not reject
    await expect(e.emit("foo", { value: 1 })).resolves.toBe(true)
  })
})

describe("Emitter — emitSerial", () => {
  test("listeners run sequentially in registration order", async () => {
    const e = new Emitter<Events>()
    const order: string[] = []
    e.on("foo", async () => {
      await new Promise((r) => setTimeout(r, 30))
      order.push("a")
    })
    e.on("foo", async () => {
      await new Promise((r) => setTimeout(r, 5))
      order.push("b")
    })
    await e.emitSerial("foo", { value: 1 })
    expect(order).toEqual(["a", "b"])
  })

  test("ctx.abort() in serial stops subsequent listeners", async () => {
    const e = new Emitter<Events>()
    const seen: string[] = []
    e.on("foo", (_, __, ctx) => {
      seen.push("a")
      ctx.abort("nope")
    })
    e.on("foo", () => {
      seen.push("b")
    })
    const ok = await e.emitSerial("foo", { value: 1 })
    expect(seen).toEqual(["a"])
    expect(ok).toBe(false)
  })

  test("ctx.abort() in parallel marks aborted but doesn't prune", async () => {
    const e = new Emitter<Events>()
    const seen: string[] = []
    e.on("foo", (_, __, ctx) => {
      seen.push("a")
      ctx.abort()
    })
    e.on("foo", () => {
      seen.push("b")
    })
    const ok = await e.emit("foo", { value: 1 })
    // Both listeners already kicked off in same microtask
    expect(seen.sort()).toEqual(["a", "b"])
    expect(ok).toBe(false)
  })
})

describe("Emitter — outer signal", () => {
  test("pre-aborted outer signal short-circuits emit", async () => {
    const e = new Emitter<Events>()
    const spy = vi.fn()
    e.on("cancelable", spy)
    const ctrl = new AbortController()
    ctrl.abort()
    const ok = await e.emit("cancelable", { signal: ctrl.signal })
    expect(spy).not.toHaveBeenCalled()
    expect(ok).toBe(false)
  })

  test("outer signal aborting mid-flight (serial) returns false", async () => {
    const e = new Emitter<Events>()
    const ctrl = new AbortController()
    const seen: string[] = []
    e.on("cancelable", async () => {
      seen.push("a")
      ctrl.abort()
    })
    e.on("cancelable", () => {
      seen.push("b")
    })
    const ok = await e.emitSerial("cancelable", { signal: ctrl.signal })
    expect(seen).toEqual(["a"]) // serial loop checks merged signal each iteration
    expect(ok).toBe(false)
  })

  test("ctx.signal is reachable from listener and reflects merged state", async () => {
    const e = new Emitter<Events>()
    const ctrl = new AbortController()
    let signalSeen: AbortSignal | undefined
    e.on("cancelable", (_, __, ctx) => {
      signalSeen = ctx.signal
    })
    await e.emit("cancelable", { signal: ctrl.signal })
    expect(signalSeen).toBeDefined()
    expect(signalSeen?.aborted).toBe(false)
    ctrl.abort()
    expect(signalSeen?.aborted).toBe(true)
  })
})

describe("Emitter — hook-style mutation (emitSerial)", () => {
  test("listener mutating event property propagates back to caller", async () => {
    const e = new Emitter<Events>()
    e.on("hook", (ev) => {
      ev.messages = ev.messages.map((n) => n * 10)
    })
    const ctx = { messages: [1, 2, 3] }
    await e.emitSerial("hook", ctx)
    expect(ctx.messages).toEqual([10, 20, 30])
  })

  test("multiple listeners mutate sequentially", async () => {
    const e = new Emitter<Events>()
    e.on("hook", (ev) => {
      ev.messages.push(2)
    })
    e.on("hook", (ev) => {
      ev.messages.push(3)
    })
    const ctx = { messages: [1] }
    await e.emitSerial("hook", ctx)
    expect(ctx.messages).toEqual([1, 2, 3])
  })

  test("array-content mutation via splice/push propagates", async () => {
    const e = new Emitter<Events>()
    e.on("hook", (ev) => {
      ev.messages.splice(0, ev.messages.length, 99)
    })
    const ctx = { messages: [1, 2, 3] }
    await e.emitSerial("hook", ctx)
    expect(ctx.messages).toEqual([99])
  })
})

describe("Emitter — microtask scheduling", () => {
  test("async listener completion is observable only after awaiting emit", async () => {
    const e = new Emitter<Events>()
    let done = false
    e.on("foo", async () => {
      await Promise.resolve()
      done = true
    })
    const promise = e.emit("foo", { value: 1 })
    // Async body yielded on `await` — `done = true` hasn't run yet
    expect(done).toBe(false)
    await promise
    expect(done).toBe(true)
  })

  test("two back-to-back emits don't block each other", async () => {
    const e = new Emitter<Events>()
    let slowDone = false
    e.on("foo", async () => {
      await new Promise((r) => setTimeout(r, 50))
      slowDone = true
    })
    let fastDone = false
    e.on("bar", () => {
      fastDone = true
    })
    const slow = e.emit("foo", { value: 1 })
    const fast = e.emit("bar", { name: "x" })
    await fast
    expect(fastDone).toBe(true)
    expect(slowDone).toBe(false)
    await slow
    expect(slowDone).toBe(true)
  })
})

describe("Emitter — wildcard + typed interaction", () => {
  test("onAny fires before typed even when registered after", async () => {
    const e = new Emitter<Events>()
    const seen: string[] = []
    e.on("foo", () => {
      seen.push("typed")
    })
    e.onAny(() => {
      seen.push("any")
    })
    await e.emitSerial("foo", { value: 1 })
    expect(seen).toEqual(["any", "typed"])
  })

  test("multiple onAny listeners fire in registration order", async () => {
    const e = new Emitter<Events>()
    const seen: string[] = []
    e.onAny(() => {
      seen.push("any1")
    })
    e.onAny(() => {
      seen.push("any2")
    })
    await e.emitSerial("foo", { value: 1 })
    expect(seen).toEqual(["any1", "any2"])
  })
})

describe("Emitter — subclass identity", () => {
  test("polymorphic this flows through on() and listener self arg", async () => {
    class Sub extends Emitter<Events> {
      label = "sub"
    }
    const e = new Sub()
    let seenLabel: string | undefined
    const chained = e.on("foo", (_, self) => {
      seenLabel = self.label
    })
    expect(chained).toBe(e)
    await e.emit("foo", { value: 1 })
    expect(seenLabel).toBe("sub")
  })
})
