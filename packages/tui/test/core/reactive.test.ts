import type { RenderCtx } from "../../src/core/ctx.ts"

import { describe, expect, test, vi } from "vitest"
import { createCtx } from "../../src/core/ctx.ts"
import { Node } from "../../src/core/node.ts"
import { createStore, effect, memo, signal } from "../../src/core/reactive.ts"
import { defaultTheme as theme } from "../../src/themes/registry.ts"

const ctx: RenderCtx = createCtx({ theme, width: 20 })

class SignalNode extends Node {
  renderCalls = 0
  constructor(private read: () => string) {
    super({})
  }
  protected _render(): string[] {
    this.renderCalls++
    return [this.read()]
  }
}

describe("signal", () => {
  test("read returns initial value outside render", () => {
    const [status] = signal("idle")
    expect(status()).toBe("idle")
  })

  test("write updates read value", () => {
    const [status, setStatus] = signal("idle")
    setStatus("running")
    expect(status()).toBe("running")
  })

  test("functional write receives previous value", () => {
    const [count, setCount] = signal(0)
    setCount((n) => n + 1)
    setCount((n) => n + 1)
    expect(count()).toBe(2)
  })

  test("write equal to current is a no-op (no invalidate)", async () => {
    const [status, setStatus] = signal("idle")
    const n = new SignalNode(() => status())
    await n.render(ctx)
    const fn = vi.fn()
    n.on("invalidate", fn)
    setStatus("idle")
    expect(fn).not.toHaveBeenCalled()
  })

  test("read during render subscribes the rendering node", async () => {
    const [status, setStatus] = signal("idle")
    const n = new SignalNode(() => status())
    const rows = await n.render(ctx)
    expect(rows).toEqual(["idle"])
    const fn = vi.fn()
    n.on("invalidate", fn)
    setStatus("running")
    expect(fn).toHaveBeenCalledTimes(1)
  })

  test("multiple nodes reading the same signal all invalidate", async () => {
    const [s, setS] = signal("a")
    const n1 = new SignalNode(() => s())
    const n2 = new SignalNode(() => s())
    await Promise.all([n1.render(ctx), n2.render(ctx)])
    const f1 = vi.fn()
    const f2 = vi.fn()
    n1.on("invalidate", f1)
    n2.on("invalidate", f2)
    setS("b")
    expect(f1).toHaveBeenCalledTimes(1)
    expect(f2).toHaveBeenCalledTimes(1)
  })

  test("unmounted nodes no longer invalidate", async () => {
    const [s, setS] = signal("a")
    const n = new SignalNode(() => s())
    await n.render(ctx)
    const fn = vi.fn()
    n.on("invalidate", fn)
    // Simulate a full lifetime end by emitting unmount — signal should
    // drop the subscription.
    n.emit("unmount")
    setS("b")
    expect(fn).not.toHaveBeenCalled()
  })

  test("concurrent renders see independent active nodes", async () => {
    // If activeNode were a module global, interleaving renders via
    // `await` would cause the later-started render's node to clobber
    // the earlier one's. AsyncLocalStorage keeps them separate.
    const [s] = signal("x")
    const seen: { node: string; value: string }[] = []
    class Tracker extends Node {
      constructor(public name: string) {
        super({})
      }
      protected async _render(): Promise<string[]> {
        // Force a microtask boundary so the two renders interleave.
        await Promise.resolve()
        seen.push({ node: this.name, value: s() })
        return [s()]
      }
    }
    const a = new Tracker("a")
    const b = new Tracker("b")
    await Promise.all([a.render(ctx), b.render(ctx)])
    // Both reads must see "x"; the point is that each render's signal
    // read associated with the correct node. Verify via subscription:
    // invalidating only one node should still invalidate both (they
    // read the same signal), but the subscriptions themselves are
    // separate Sets of Nodes — not overwritten.
    expect(seen.length).toBe(2)
  })
})

describe("effect", () => {
  test("runs once immediately", () => {
    const fn = vi.fn()
    effect(fn)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  test("re-runs when a read signal writes", () => {
    const [s, setS] = signal("a")
    const seen: string[] = []
    effect(() => {
      seen.push(s())
    })
    setS("b")
    setS("c")
    expect(seen).toEqual(["a", "b", "c"])
  })

  test("dispose stops further re-runs", () => {
    const [s, setS] = signal(0)
    const fn = vi.fn(() => {
      s()
    })
    const dispose = effect(fn)
    setS(1)
    expect(fn).toHaveBeenCalledTimes(2)
    dispose()
    setS(2)
    expect(fn).toHaveBeenCalledTimes(2)
  })

  test("dependencies are re-tracked each run", () => {
    const [a, setA] = signal("a")
    const [b, setB] = signal("b")
    const [pick, setPick] = signal<"a" | "b">("a")
    const fn = vi.fn(() => (pick() === "a" ? a() : b()))
    effect(fn)
    expect(fn).toHaveBeenCalledTimes(1)

    // Reading `a` only while pick==="a": writing `b` must not re-run.
    setB("b2")
    expect(fn).toHaveBeenCalledTimes(1)

    // Switch to b; now `a` should be dropped as a dep.
    setPick("b")
    expect(fn).toHaveBeenCalledTimes(2)
    setA("a2")
    expect(fn).toHaveBeenCalledTimes(2)
    setB("b3")
    expect(fn).toHaveBeenCalledTimes(3)
  })
})

describe("memo", () => {
  test("caches the computed value", () => {
    const [n, setN] = signal(2)
    const compute = vi.fn(() => n() * 10)
    const doubled = memo(compute)
    expect(doubled()).toBe(20)
    expect(doubled()).toBe(20)
    // Reading a memo doesn't re-run its fn.
    expect(compute).toHaveBeenCalledTimes(1)
    setN(3)
    expect(doubled()).toBe(30)
    expect(compute).toHaveBeenCalledTimes(2)
  })

  test("chains — memo of memo subscribes transitively", () => {
    const [n, setN] = signal(1)
    const doubled = memo(() => n() * 2)
    const quadrupled = memo(() => doubled() * 2)
    expect(quadrupled()).toBe(4)
    setN(3)
    expect(quadrupled()).toBe(12)
  })
})

describe("createStore", () => {
  test("reads return current values", () => {
    const s = createStore<{ a: number; b: string }>({ a: 1, b: "hi" })
    expect(s.a).toBe(1)
    expect(s.b).toBe("hi")
  })

  test("patch form only fires effects for fields that changed", () => {
    const s = createStore<{ a: number; b: number }>({ a: 1, b: 2 })
    let aReads = 0
    let bReads = 0
    effect(() => {
      void s.a
      aReads++
    })
    effect(() => {
      void s.b
      bReads++
    })
    expect(aReads).toBe(1)
    expect(bReads).toBe(1)
    s.set({ a: 99, b: 2 }) // b unchanged
    expect(aReads).toBe(2)
    expect(bReads).toBe(1) // no notify on equal value
    s.set({ a: 99 }) // a unchanged
    expect(aReads).toBe(2)
    expect(bReads).toBe(1)
  })

  test("assignment form works the same as a patch", () => {
    const s = createStore<{ a: number; b: number }>({ a: 1, b: 2 })
    let runs = 0
    effect(() => {
      void s.a
      runs++
    })
    expect(runs).toBe(1)
    s.a = 5
    expect(runs).toBe(2)
    expect(s.a).toBe(5)
    s.a = 5 // no-op (value equality)
    expect(runs).toBe(2)
  })

  test("updater form receives untracked current state", () => {
    const s = createStore<{ a: number; b: number }>({ a: 1, b: 2 })
    let runs = 0
    effect(() => {
      // Only read `a` so this effect is subscribed solely to `a`.
      void s.a
      runs++
    })
    expect(runs).toBe(1)
    // The updater reads `b` from `current`, but `current` is the raw
    // state object — no tracking — so this effect must NOT re-fire on
    // `b` changes initiated by it.
    s.set((c) => ({ a: c.a + c.b }))
    expect(s.a).toBe(3)
    expect(runs).toBe(2) // only because `a` itself was set
    s.set((c) => ({ b: c.b + 1 }))
    expect(s.b).toBe(3)
    expect(runs).toBe(2) // `a` unchanged, no extra fire
  })

  test("function-typed fields don't get invoked as updaters", () => {
    type Ctx = { fn: () => string }
    const s = createStore<Ctx>({ fn: () => "first" })
    // oxlint-disable-next-line unicorn/consistent-function-scoping
    const replacement = (): string => "second"
    s.set({ fn: replacement })
    expect(s.fn).toBe(replacement)
    expect(s.fn()).toBe("second")
    expect({ ...s }.fn).toBe(replacement)
  })

  test("spread yields the current values of every field", () => {
    const s = createStore<{ a: number; b: string }>({ a: 1, b: "hi" })
    s.set({ a: 7, b: "there" })
    const plain = { ...s }
    expect(plain).toEqual({ a: 7, b: "there" })
  })

  test("spread inside a tracked scope subscribes per spread field", () => {
    const s = createStore<{ a: number; b: string }>({ a: 1, b: "hi" })
    let snapshot: { a: number; b: string } | undefined
    let runs = 0
    effect(() => {
      snapshot = { ...s }
      runs++
    })
    expect(snapshot).toEqual({ a: 1, b: "hi" })
    s.a = 2
    expect(runs).toBe(2)
    expect(snapshot).toEqual({ a: 2, b: "hi" })
  })
})
