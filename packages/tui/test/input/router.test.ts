import type { KeyEvent } from "../../src/input/keys.ts"
import type { Box } from "../../src/widgets/box.ts"

import { describe, expect, test } from "vitest"
import { Actions } from "../../src/input/actions.ts"
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
    router.bind("ctrl-c", () => {
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
    router.bind("ctrl-c", () => {
      throw new Error("should not fire")
    })
    router.focus(n)
    router.dispatch({ event: makeKey("a"), type: "key" })
    expect(nodeSeen).toEqual(["a"])
  })

  test("global handler fires as a last-resort fallback", () => {
    // `bind()` runs in phase 3 — after node bubble and keymap lookup.
    // The node's raw key listener sees the event first; the global
    // handler catches the unclaimed event and consumes it.
    const router = new InputRouter()
    const n = text("x")
    const nodeSeen: string[] = []
    n.on("key", (ev) => nodeSeen.push(ev.name))
    router.bind("ctrl-c", () => true)
    router.focus(n)
    const consumed = router.dispatch({ event: makeKey("c", { ctrl: true }), type: "key" })
    expect(consumed).toBe(true)
    expect(nodeSeen).toEqual(["c"])
  })

  test("bind returns an unsubscribe function", () => {
    const router = new InputRouter()
    let hits = 0
    const off = router.bind("a", () => {
      hits++
    })
    router.dispatch({ event: makeKey("a"), type: "key" })
    expect(hits).toBe(1)
    off()
    router.dispatch({ event: makeKey("a"), type: "key" })
    expect(hits).toBe(1)
  })
})

describe("InputRouter — keymap → action dispatch", () => {
  test("keymap entry with action id fires the focused node's handler", () => {
    const router = new InputRouter()
    const actions = new Actions()
    actions.setTargetResolver(() => router.focused)
    router.setActions(actions)
    actions.register({ "input.cursorLeft": { keys: ["left"] } })

    const n = text("t")
    let fired = 0
    ;(n as unknown as { actions: Record<string, () => void> }).actions = {
      "input.cursorLeft": () => fired++,
    }
    router.focus(n)
    router.setKeymapIndex(actions.buildKeymap())
    const consumed = router.dispatch({ event: makeKey("left"), type: "key" })
    expect(consumed).toBe(true)
    expect(fired).toBe(1)
  })

  test("action with catalog `fn` fires directly without walking", () => {
    const router = new InputRouter()
    const actions = new Actions()
    actions.setTargetResolver(() => router.focused)
    router.setActions(actions)
    let fired = 0
    actions.register({ "global.quit": { fn: () => fired++, keys: ["ctrl-c"] } })
    router.setKeymapIndex(actions.buildKeymap())
    const consumed = router.dispatch({ event: makeKey("c", { ctrl: true }), type: "key" })
    expect(consumed).toBe(true)
    expect(fired).toBe(1)
  })

  test("dispatch walks the focus chain for node.actions[id]", () => {
    const router = new InputRouter()
    const actions = new Actions()
    actions.setTargetResolver(() => router.focused)
    router.setActions(actions)
    const parent = box({})
    const child = text("c")
    parent.add(child)
    let fired = 0
    ;(parent as unknown as { actions: Record<string, () => void> }).actions = {
      "app.doit": () => fired++,
    }
    actions.register({ "app.doit": { keys: ["ctrl-d"] } })
    router.focus(child)
    router.setKeymapIndex(actions.buildKeymap())
    router.dispatch({ event: makeKey("d", { ctrl: true }), type: "key" })
    expect(fired).toBe(1)
  })

  test("unmatched keys fall through to the raw key event", () => {
    const router = new InputRouter()
    const n = text("t")
    const seen: string[] = []
    n.on("key", (ev) => seen.push(ev.name))
    router.focus(n)
    router.setKeymap({ enter: "input.foo" })
    // "a" isn't bound — bubbles as a raw key first anyway.
    router.dispatch({ event: makeKey("a"), type: "key" })
    expect(seen).toEqual(["a"])
  })

  test("direct handler in keymap fires and consumes", () => {
    const router = new InputRouter()
    let fired = 0
    router.setKeymap({
      "ctrl-s": () => {
        fired++
        return true
      },
    })
    const consumed = router.dispatch({ event: makeKey("s", { ctrl: true }), type: "key" })
    expect(consumed).toBe(true)
    expect(fired).toBe(1)
  })

  test("setKeymap replaces the index wholesale", () => {
    const router = new InputRouter()
    const actions = new Actions()
    router.setActions(actions)
    let fired = 0
    router.setKeymap({ left: () => (fired++, true) })
    router.dispatch({ event: makeKey("left"), type: "key" })
    expect(fired).toBe(1)
    router.setKeymap({ right: () => (fired++, true) })
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
