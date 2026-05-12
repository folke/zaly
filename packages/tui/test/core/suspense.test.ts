// oxlint-disable unicorn/consistent-function-scoping
import { describe, expect, test } from "vitest"
import { createCtx } from "../../src/core/ctx.ts"
import { Node } from "../../src/core/node.ts"
import {
  createAsync,
  createNode,
  createRoot,
  createSuspenseBoundary,
  memo,
  provideContext,
  signal,
  SuspenseContext,
  withOwner,
} from "../../src/core/reactive.ts"
import { defaultTheme as theme } from "../../src/themes/registry.ts"

/** Resolve on next microtask — used to let `.then` / `.finally`
 *  callbacks drain before assertions. */
const flush = (): Promise<void> => Promise.resolve()

describe("createSuspenseBoundary", () => {
  test("starts idle", () => {
    const b = createSuspenseBoundary()
    expect(b.active()).toBe(false)
  })

  test("increment / decrement track count", () => {
    const b = createSuspenseBoundary()
    b.increment()
    expect(b.active()).toBe(true)
    b.increment()
    expect(b.active()).toBe(true)
    b.decrement()
    expect(b.active()).toBe(true)
    b.decrement()
    expect(b.active()).toBe(false)
  })

  test("whenIdle resolves immediately when already idle", async () => {
    const b = createSuspenseBoundary()
    await b.whenIdle() // would hang the test if it didn't resolve
    expect(b.active()).toBe(false)
  })

  test("whenIdle resolves after count returns to 0", async () => {
    const b = createSuspenseBoundary()
    b.increment()
    let resolved = false
    const p = b.whenIdle().then(() => {
      resolved = true
    })
    await flush()
    expect(resolved).toBe(false)
    b.decrement()
    await p
    expect(resolved).toBe(true)
  })

  test("whenIdle waits for the LAST decrement when count > 1", async () => {
    const b = createSuspenseBoundary()
    b.increment()
    b.increment()
    let resolved = false
    const p = b.whenIdle().then(() => {
      resolved = true
    })
    b.decrement()
    await flush()
    expect(resolved).toBe(false)
    b.decrement()
    await p
    expect(resolved).toBe(true)
  })

  test("re-issuing whenIdle after a previous one resolved works again", async () => {
    const b = createSuspenseBoundary()
    b.increment()
    const p1 = b.whenIdle()
    b.decrement()
    await p1
    b.increment()
    let resolved = false
    const p2 = b.whenIdle().then(() => {
      resolved = true
    })
    await flush()
    expect(resolved).toBe(false)
    b.decrement()
    await p2
    expect(resolved).toBe(true)
  })

  test("nested: child 0↔1 transitions propagate to parent", () => {
    const parent = createSuspenseBoundary()
    const child = createSuspenseBoundary(parent)
    expect(parent.active()).toBe(false)
    child.increment()
    expect(parent.active()).toBe(true)
    child.increment()
    expect(parent.active()).toBe(true) // still 1 at parent
    child.decrement()
    expect(parent.active()).toBe(true)
    child.decrement()
    expect(parent.active()).toBe(false)
  })

  test("nested: parent's whenIdle waits for child's pending work", async () => {
    const parent = createSuspenseBoundary()
    const child = createSuspenseBoundary(parent)
    child.increment()
    let resolved = false
    const p = parent.whenIdle().then(() => {
      resolved = true
    })
    await flush()
    expect(resolved).toBe(false)
    child.decrement()
    await p
    expect(resolved).toBe(true)
  })
})

describe("createAsync + SuspenseContext", () => {
  test("without a boundary, fires-and-forgets — accessor updates eventually", async () => {
    const value = createRoot(() =>
      createAsync(async () => "resolved", { initialValue: "initial" })
    )
    expect(value()).toBe("initial")
    // Two microtask ticks: one for the .then, one for the .finally.
    await flush()
    await flush()
    expect(value()).toBe("resolved")
  })

  test("with a boundary, increments before the await and decrements after", async () => {
    const boundary = createSuspenseBoundary()
    // Defer the promise so we can observe the in-flight state.
    let resolveWork: (v: string) => void = () => {}
    const work = new Promise<string>((r) => {
      resolveWork = r
    })

    const { result, owner } = await createRootSync(() => {
      provideContext(SuspenseContext, boundary)
      return createAsync(() => work, { initialValue: "initial" })
    })

    // Effect ran synchronously; createAsync should have incremented.
    expect(boundary.active()).toBe(true)
    expect(result()).toBe("initial")

    resolveWork("resolved")
    await boundary.whenIdle()
    expect(boundary.active()).toBe(false)
    expect(result()).toBe("resolved")

    owner.dispose()
  })

  test("multiple createAsync in the same boundary aggregate count", async () => {
    const boundary = createSuspenseBoundary()
    let resolveA: (v: string) => void = () => {}
    let resolveB: (v: string) => void = () => {}
    const a = new Promise<string>((r) => {
      resolveA = r
    })
    const b = new Promise<string>((r) => {
      resolveB = r
    })

    const { result, owner } = await createRootSync(() => {
      provideContext(SuspenseContext, boundary)
      const va = createAsync(() => a, { initialValue: "a0" })
      const vb = createAsync(() => b, { initialValue: "b0" })
      return () => `${va()}|${vb()}`
    })

    expect(boundary.active()).toBe(true)
    expect(result()).toBe("a0|b0")

    resolveA("a1")
    await flush()
    await flush()
    // First settled, but `b` still pending — boundary should still be active.
    expect(boundary.active()).toBe(true)
    expect(result()).toBe("a1|b0")

    resolveB("b1")
    await boundary.whenIdle()
    expect(boundary.active()).toBe(false)
    expect(result()).toBe("a1|b1")

    owner.dispose()
  })

  test("drain pattern: render → whenIdle → re-read → reflects resolved values", async () => {
    // Models Stream.render: snapshot a value, await the boundary, re-read.
    const boundary = createSuspenseBoundary()
    let resolveWork: (v: string) => void = () => {}
    const work = new Promise<string>((r) => {
      resolveWork = r
    })

    const { result, owner } = await createRootSync(() => {
      provideContext(SuspenseContext, boundary)
      return createAsync(() => work, { initialValue: "initial" })
    })

    // First "render" — captures the initial value while async is in flight.
    const firstSnapshot = result()
    expect(firstSnapshot).toBe("initial")
    expect(boundary.active()).toBe(true)

    // Stream-style drain: schedule the resolve, then await whenIdle.
    resolveWork("resolved")
    await boundary.whenIdle()

    // Second "render" — same accessor, now reflects the resolved value.
    const secondSnapshot = result()
    expect(secondSnapshot).toBe("resolved")
    expect(boundary.active()).toBe(false)

    owner.dispose()
  })

  test("chained re-fire: setting a tracked signal kicks the boundary up again", async () => {
    const boundary = createSuspenseBoundary()
    const [trigger, setTrigger] = signal(0)
    const runs: number[] = []
    let resolveCurrent: (v: number) => void = () => {}
    const makePromise = (): Promise<number> =>
      new Promise<number>((r) => {
        resolveCurrent = r
      })
    let current = makePromise()

    const { result, owner } = await createRootSync(() => {
      provideContext(SuspenseContext, boundary)
      return createAsync(
        async () => {
          const n = trigger() // tracked
          runs.push(n)
          const v = await current
          current = makePromise()
          return v
        },
        { initialValue: -1 }
      )
    })

    expect(runs).toEqual([0])
    expect(boundary.active()).toBe(true)

    // Resolve the first one.
    resolveCurrent(10)
    await boundary.whenIdle()
    expect(boundary.active()).toBe(false)
    expect(result()).toBe(10)

    // Trigger a re-fire — boundary should go active again.
    setTrigger(1)
    expect(runs).toEqual([0, 1])
    expect(boundary.active()).toBe(true)

    resolveCurrent(20)
    await boundary.whenIdle()
    expect(boundary.active()).toBe(false)
    expect(result()).toBe(20)

    owner.dispose()
  })
})

/** Build a root scope, run `fn` inside it, and return both the result
 *  and the owner. Mirrors how Stream's `append` sets up an Owner around
 *  a widget body so consumers of `createAsync` find the boundary. */
async function createRootSync<T>(fn: () => T): Promise<{ result: T; owner: { dispose: () => void } }> {
  // The owner is the active one inside `createRoot`; we capture it via
  // closure so callers can tear down deterministically between tests.
  let dispose = (): void => {}
  const result = createRoot((d) => {
    dispose = d
    return fn()
  })
  return { owner: { dispose }, result }
}

/** Minimal leaf Node that reads a content accessor and returns its rows.
 *  Mirrors the relevant tracking behaviour of `Text` without pulling in
 *  the formatting layer. */
class ReaderNode extends Node<{ content: () => string }> {
  renderCalls = 0
  async _render(): Promise<string[]> {
    this.renderCalls++
    return [this.state.content()]
  }
}

describe("createAsync — Stream-style integration", () => {
  test("drain pattern with Owner-rooted createAsync + memo + Node propagates resolved value", async () => {
    const ctx = createCtx({ theme, width: 20 })
    const rootOwner = createRoot(() => {
      // empty body — captures a root Owner like Renderer does
    })
    // `createRoot` above returns the body result, not the owner — recreate
    // a root we can hand to `withOwner` by calling it again with a capture.
    let outerOwner: { dispose: () => void } | undefined
    createRoot((dispose) => {
      outerOwner = { dispose }
    })

    const boundary = createSuspenseBoundary()
    let resolveWork: (v: string) => void = () => {}
    const work = new Promise<string>((r) => {
      resolveWork = r
    })

    // Stream-append style: install a Suspense boundary in the appended
    // subtree's Owner scope, then build the Node inside.
    const node = withOwner(rootOwner as never, () =>
      createNode(() => {
        provideContext(SuspenseContext, boundary)
        const body = createAsync(() => work, { initialValue: "initial" })
        const formatted = memo(() => `[${body()}]`)
        return new ReaderNode({ content: formatted })
      })
    )

    // Mirror Stream.render: compute → drain → recompute.
    let rows = await node.render(ctx)
    expect(rows).toEqual(["[initial]"])
    expect(boundary.active()).toBe(true)
    expect(node.renderCalls).toBe(1)

    // Resolve the work and drain.
    resolveWork("resolved")
    await boundary.whenIdle()

    rows = await node.render(ctx)
    expect(rows).toEqual(["[resolved]"])
    expect(boundary.active()).toBe(false)
    // Must have re-rendered — cache invalidation through createAsync's
    // setValue → memo re-fire → Node.invalidate is what makes this real.
    expect(node.renderCalls).toBe(2)

    outerOwner?.dispose()
  })

  test("multiple appended subtrees — each with its own boundary — all drain to resolved", async () => {
    const ctx = createCtx({ theme, width: 20 })

    type State = {
      node: ReaderNode
      boundary: ReturnType<typeof createSuspenseBoundary>
      resolve: (v: string) => void
    }

    const makeState = (label: string): State => {
      const boundary = createSuspenseBoundary()
      let resolve: (v: string) => void = () => {}
      const work = new Promise<string>((r) => {
        resolve = r
      })
      const node = createRoot(() => {
        provideContext(SuspenseContext, boundary)
        const body = createAsync(() => work, { initialValue: `${label}:initial` })
        const formatted = memo(() => `[${body()}]`)
        return new ReaderNode({ content: formatted })
      })
      return { boundary, node, resolve }
    }

    const states: State[] = [makeState("a"), makeState("b"), makeState("c")]

    // First pass — compute every node at initial values.
    let allRows: string[] = []
    for (const s of states) {
      const rows = await s.node.render(ctx)
      allRows.push(...rows)
    }
    expect(allRows).toEqual(["[a:initial]", "[b:initial]", "[c:initial]"])
    expect(states.every((s) => s.boundary.active())).toBe(true)

    // Kick off all resolutions in parallel — mirrors how real `createAsync`
    // bodies run their async work concurrently after the surface starts
    // rendering. The drain loop below then awaits whichever boundaries
    // are still active each iteration.
    states[0].resolve("a:resolved")
    states[1].resolve("b:resolved")
    states[2].resolve("c:resolved")

    // Stream.render's drain loop — verbatim shape: wait for all active
    // boundaries to settle, re-render every state (Node-cache makes
    // unchanged renders cheap), loop while anything's active.
    while (states.some((s) => s.boundary.active())) {
      await Promise.all(
        states.filter((s) => s.boundary.active()).map((s) => s.boundary.whenIdle())
      )
      allRows = []
      for (const s of states) {
          const rows = await s.node.render(ctx)
        allRows.push(...rows)
      }
    }

    expect(allRows).toEqual(["[a:resolved]", "[b:resolved]", "[c:resolved]"])
    expect(states.every((s) => !s.boundary.active())).toBe(true)
  })
})
