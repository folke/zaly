import { describe, expect, test, vi } from "vitest"
import { Emitter } from "../../src/core/emitter.ts"

type E = {
  ping: [value: number]
  pong: [a: string, b: string]
  tick: []
}

const noop = () => {}

describe("Emitter", () => {
  test("emit invokes listener with typed args + trailing self", () => {
    const e = new Emitter<E>()
    const fn = vi.fn()
    e.on("ping", fn)
    e.emit("ping", 42)
    expect(fn).toHaveBeenCalledTimes(1)
    // Listeners receive the event args followed by the emitter itself.
    expect(fn).toHaveBeenCalledWith(42, e)
  })

  test("emit invokes multiple listeners in order", () => {
    const e = new Emitter<E>()
    const calls: string[] = []
    e.on("tick", () => calls.push("a"))
    e.on("tick", () => calls.push("b"))
    e.on("tick", () => calls.push("c"))
    e.emit("tick")
    expect(calls).toEqual(["a", "b", "c"])
  })

  test("emit with no listeners returns false", () => {
    const e = new Emitter<E>()
    expect(e.emit("tick")).toBe(false)
  })

  test("emit with listeners returns true", () => {
    const e = new Emitter<E>()
    e.on("tick", noop)
    expect(e.emit("tick")).toBe(true)
  })

  test("off removes the listener", () => {
    const e = new Emitter<E>()
    const fn = vi.fn()
    e.on("ping", fn)
    e.off("ping", fn)
    e.emit("ping", 1)
    expect(fn).not.toHaveBeenCalled()
  })

  test("off only removes the matching listener", () => {
    const e = new Emitter<E>()
    const a = vi.fn()
    const b = vi.fn()
    e.on("ping", a)
    e.on("ping", b)
    e.off("ping", a)
    e.emit("ping", 1)
    expect(a).not.toHaveBeenCalled()
    expect(b).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledWith(1, e)
  })

  test("once only fires one time", () => {
    const e = new Emitter<E>()
    const fn = vi.fn()
    e.once("ping", fn)
    e.emit("ping", 1)
    e.emit("ping", 2)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith(1, e)
  })

  test("once can be removed before firing", () => {
    const e = new Emitter<E>()
    const fn = vi.fn()
    e.once("ping", fn)
    e.off("ping", fn)
    e.emit("ping", 1)
    expect(fn).not.toHaveBeenCalled()
  })

  test("listener added during emit is not invoked in that emit", () => {
    const e = new Emitter<E>()
    const later = vi.fn()
    e.on("tick", () => e.on("tick", later))
    e.emit("tick")
    expect(later).not.toHaveBeenCalled()
    e.emit("tick")
    expect(later).toHaveBeenCalledTimes(1)
  })

  test("listener removed during emit by an earlier listener is still invoked in that emit", () => {
    // Standard EventEmitter semantic: a snapshot is taken at emit() time.
    const e = new Emitter<E>()
    const b = vi.fn()
    e.on("tick", () => e.off("tick", b))
    e.on("tick", b)
    e.emit("tick")
    expect(b).toHaveBeenCalledTimes(1)
  })

  test("on/off/once return this for chaining", () => {
    const e = new Emitter<E>()
    expect(e.on("ping", noop)).toBe(e)
    expect(e.off("ping", noop)).toBe(e)
    expect(e.once("ping", noop)).toBe(e)
  })

  test("different events are isolated", () => {
    const e = new Emitter<E>()
    const ping = vi.fn()
    const pong = vi.fn()
    e.on("ping", ping)
    e.on("pong", pong)
    e.emit("ping", 1)
    expect(ping).toHaveBeenCalledTimes(1)
    expect(ping).toHaveBeenCalledWith(1, e)
    expect(pong).not.toHaveBeenCalled()
  })
})
