import type { KeyEvent } from "../../src/input/keys.ts"
import type { Box } from "../../src/widgets/box.ts"

import { describe, expect, test } from "vitest"
import { InputRouter } from "../../src/input/router.ts"
import { box } from "../../src/widgets/box.ts"
import { text } from "../../src/widgets/text.ts"

function makeKey(name: string, mods: Partial<KeyEvent> = {}): KeyEvent {
  return { alt: false, ctrl: false, meta: false, name, shift: false, ...mods }
}

describe("InputRouter — focus", () => {
  test("focusing a node fires focus on it and blur on the previous", () => {
    const router = new InputRouter()
    const a = text("a")
    const b = text("b")
    let aFocus = 0,
      aBlur = 0,
      bFocus = 0
    a.on("focus", () => aFocus++)
    a.on("blur", () => aBlur++)
    b.on("focus", () => bFocus++)

    router.focus(a)
    expect(aFocus).toBe(1)
    expect(aBlur).toBe(0)

    router.focus(b)
    expect(aBlur).toBe(1)
    expect(bFocus).toBe(1)
  })

  test("focusing the same node twice is a no-op", () => {
    const router = new InputRouter()
    const a = text("a")
    let focusCount = 0
    a.on("focus", () => focusCount++)
    router.focus(a)
    router.focus(a)
    expect(focusCount).toBe(1)
  })
})

describe("InputRouter — key dispatch", () => {
  test("key events reach the focused node", () => {
    const router = new InputRouter()
    const n = text("x")
    const received: string[] = []
    n.on("key", (ev) => received.push(ev.name))
    router.focus(n)
    router.dispatch({ event: makeKey("a"), type: "key" })
    expect(received).toEqual(["a"])
  })

  test("keys bubble up through the parent chain", () => {
    const router = new InputRouter()
    const parent: Box = box({})
    const child = text("c")
    parent.add(child)
    const seen: string[] = []
    child.on("key", () => seen.push("child"))
    parent.on("key", () => seen.push("parent"))
    router.focus(child)
    router.dispatch({ event: makeKey("x"), type: "key" })
    expect(seen).toEqual(["child", "parent"])
  })

  test("calling stop() halts bubbling", () => {
    const router = new InputRouter()
    const parent: Box = box({})
    const child = text("c")
    parent.add(child)
    const seen: string[] = []
    child.on("key", (ev) => {
      seen.push("child")
      ev.stop()
    })
    parent.on("key", () => seen.push("parent"))
    router.focus(child)
    router.dispatch({ event: makeKey("x"), type: "key" })
    expect(seen).toEqual(["child"])
  })

  test("no focused node — dispatch is a no-op", () => {
    const router = new InputRouter()
    // Doesn't throw.
    expect(() => router.dispatch({ event: makeKey("q"), type: "key" })).not.toThrow()
  })
})

describe("InputRouter — globals", () => {
  test("global handler fires on matching pattern", () => {
    const router = new InputRouter()
    let hits = 0
    router.bindGlobal("ctrl-c", () => {
      hits++
    })
    router.dispatch({ event: makeKey("c", { ctrl: true }), type: "key" })
    expect(hits).toBe(1)
  })

  test("global with no match falls through to the focused node", () => {
    const router = new InputRouter()
    const n = text("x")
    const nodeSeen: string[] = []
    n.on("key", (ev) => nodeSeen.push(ev.name))
    router.bindGlobal("ctrl-c", () => {
      throw new Error("should not fire")
    })
    router.focus(n)
    router.dispatch({ event: makeKey("a"), type: "key" })
    expect(nodeSeen).toEqual(["a"])
  })

  test("global handler returning true consumes the event", () => {
    const router = new InputRouter()
    const n = text("x")
    const nodeSeen: string[] = []
    n.on("key", (ev) => nodeSeen.push(ev.name))
    router.bindGlobal("ctrl-c", () => true)
    router.focus(n)
    const consumed = router.dispatch({ event: makeKey("c", { ctrl: true }), type: "key" })
    expect(consumed).toBe(true)
    expect(nodeSeen).toEqual([])
  })

  test("bindGlobal returns an unsubscribe function", () => {
    const router = new InputRouter()
    let hits = 0
    const off = router.bindGlobal("a", () => {
      hits++
    })
    router.dispatch({ event: makeKey("a"), type: "key" })
    expect(hits).toBe(1)
    off()
    router.dispatch({ event: makeKey("a"), type: "key" })
    expect(hits).toBe(1)
  })
})

describe("InputRouter — named actions via keymap", () => {
  test("internal action on the focused node fires and is marked consumed", () => {
    const router = new InputRouter()
    const n = text("t") as unknown as {
      actions?: Record<string, () => void>
      type?: string
      id?: string
      emit: (...a: unknown[]) => boolean
      on: (...a: unknown[]) => unknown
      parent?: unknown
    }
    n.type = "input"
    let fired = 0
    n.actions = { cursorLeft: () => fired++ }
    router.focus(n as unknown as Parameters<typeof router.focus>[0])
    router.setKeymaps({ "input.cursorLeft": ["left"] })
    const consumed = router.dispatch({ event: makeKey("left"), type: "key" })
    expect(consumed).toBe(true)
    expect(fired).toBe(1)
  })

  test("id bindings beat type bindings on the same node", () => {
    const router = new InputRouter()
    const n = text("t") as unknown as {
      actions?: Record<string, () => void>
      type?: string
      id?: string
      emit: (...a: unknown[]) => boolean
      on: (...a: unknown[]) => unknown
      parent?: unknown
    }
    n.type = "input"
    n.id = "editor"
    const calls: string[] = []
    n.actions = {
      submitFromId: () => calls.push("id"),
      submitFromType: () => calls.push("type"),
    }
    router.focus(n as unknown as Parameters<typeof router.focus>[0])
    router.setKeymaps({
      "editor.submitFromId": ["enter"],
      "input.submitFromType": ["enter"],
    })
    router.dispatch({ event: makeKey("enter"), type: "key" })
    expect(calls).toEqual(["id"])
  })

  test("external scope-registered actions receive the node and fire when node's id matches", () => {
    const router = new InputRouter()
    const n = text("t") as unknown as {
      id?: string
      type?: string
      actions?: Record<string, () => void>
      emit: (...a: unknown[]) => boolean
      on: (...a: unknown[]) => unknown
      parent?: unknown
    }
    n.id = "editor"
    const received: unknown[] = []
    router.registerActions("editor", {
      toggleThinking: (node) => received.push(node),
    })
    router.focus(n as unknown as Parameters<typeof router.focus>[0])
    router.setKeymaps({ "editor.toggleThinking": ["ctrl-t"] })
    const consumed = router.dispatch({ event: makeKey("t", { ctrl: true }), type: "key" })
    expect(consumed).toBe(true)
    expect(received).toEqual([n])
  })

  test("scope chain walks parents — ancestor scope still fires", () => {
    const router = new InputRouter()
    const root = box({})
    const child = text("c")
    root.add(child)
    // Tag root as `"global"` like the UI surface does.
    ;(root as unknown as { id?: string }).id = "global"
    let fired = 0
    router.registerActions("global", { quit: () => fired++ })
    router.focus(child)
    router.setKeymaps({ "global.quit": ["ctrl-c"] })
    router.dispatch({ event: makeKey("c", { ctrl: true }), type: "key" })
    expect(fired).toBe(1)
  })

  test("unmatched keys fall through to the raw key event", () => {
    const router = new InputRouter()
    const n = text("t")
    const seen: string[] = []
    n.on("key", (ev) => seen.push(ev.name))
    router.focus(n)
    router.setKeymaps({ "input.foo": ["enter"] })
    // "a" isn't bound — should bubble as a raw key.
    router.dispatch({ event: makeKey("a"), type: "key" })
    expect(seen).toEqual(["a"])
  })

  test("setKeymaps rebuilds the index — subsequent calls replace, not merge", () => {
    const router = new InputRouter()
    const n = text("t") as unknown as {
      actions?: Record<string, () => void>
      type?: string
      emit: (...a: unknown[]) => boolean
      on: (...a: unknown[]) => unknown
      parent?: unknown
    }
    n.type = "input"
    let fired = 0
    n.actions = { cursorLeft: () => fired++ }
    router.focus(n as unknown as Parameters<typeof router.focus>[0])
    router.setKeymaps({ "input.cursorLeft": ["left"] })
    router.dispatch({ event: makeKey("left"), type: "key" })
    expect(fired).toBe(1)
    // Replace with a different binding; "left" should no longer fire
    // cursorLeft (keymap replaced wholesale).
    router.setKeymaps({ "input.cursorLeft": ["right"] })
    router.dispatch({ event: makeKey("left"), type: "key" })
    expect(fired).toBe(1)
    router.dispatch({ event: makeKey("right"), type: "key" })
    expect(fired).toBe(2)
  })
})

describe("InputRouter — paste", () => {
  test("paste events reach the focused node with the full text", () => {
    const router = new InputRouter()
    const n = text("x")
    const texts: string[] = []
    n.on("paste", (ev) => texts.push(ev.text))
    router.focus(n)
    router.dispatch({ text: "hello world", type: "paste" })
    expect(texts).toEqual(["hello world"])
  })

  test("paste bubbles up and respects stop()", () => {
    const router = new InputRouter()
    const parent: Box = box({})
    const child = text("c")
    parent.add(child)
    const seen: string[] = []
    child.on("paste", (ev) => {
      seen.push(`child:${ev.text}`)
      ev.stop()
    })
    parent.on("paste", () => seen.push("parent"))
    router.focus(child)
    router.dispatch({ text: "abc", type: "paste" })
    expect(seen).toEqual(["child:abc"])
  })
})
