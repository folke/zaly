import type { Node } from "../../src/index.ts"
import type { KeyEvent } from "../../src/input/keys.ts"
import type { Box } from "../../src/widgets/box.ts"

import { describe, expect, test } from "vitest"
import { Actions } from "../../src/input/actions.ts"
import { InputRouter } from "../../src/input/router.ts"
import { box } from "../../src/widgets/box.ts"
import { text } from "../../src/widgets/text.ts"
import { mockMountCtx } from "../renderer/mock.ts"

function makeKey(name: string, mods: Partial<KeyEvent> = {}): KeyEvent {
  return { alt: false, ctrl: false, meta: false, name, shift: false, ...mods }
}

function setup() {
  const router = new InputRouter()
  const actions = new Actions()
  actions.setTargetResolver(() => router.focused)
  router.setActions(actions)
  const mount = <T extends Node>(node: T) => {
    node.mount(
      mockMountCtx("ui", {
        actions,
        input: {
          bind: (binding) => actions.bind(binding),
          blur: () => router.focus(undefined),
          focus: (n) => router.focus(n),
        },
      })
    )
    return node
  }
  return { actions, mount, router }
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
    n.on("key", (ev) => received.push(ev.key.name))
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
      ev.key.stop()
    })
    parent.on("key", () => seen.push("parent"))
    router.focus(child)
    router.dispatch({ event: makeKey("x"), type: "key" })
    expect(seen).toEqual(["child"])
  })

  test("no focused node — dispatch is a no-op", () => {
    const router = new InputRouter()
    expect(() => router.dispatch({ event: makeKey("q"), type: "key" })).not.toThrow()
  })
})

describe("InputRouter — action bindings", () => {
  test("global action fires on matching pattern", () => {
    const { actions, router } = setup()
    let hits = 0
    actions.bind({ fn: () => hits++, id: "test.global", keys: "ctrl-c" })
    router.dispatch({ event: makeKey("c", { ctrl: true }), type: "key" })
    expect(hits).toBe(1)
  })

  test("global with no match falls through to the focused node", () => {
    const { actions, mount, router } = setup()
    const n = mount(text("x"))
    const nodeSeen: string[] = []
    n.on("key", (ev) => nodeSeen.push(ev.key.name))
    actions.bind({
      fn: () => {
        throw new Error("should not fire")
      },
      id: "test.global",
      keys: "ctrl-c",
    })
    router.focus(n)
    router.dispatch({ event: makeKey("a"), type: "key" })
    expect(nodeSeen).toEqual(["a"])
  })

  test("global action fires after raw key bubble", () => {
    const { actions, mount, router } = setup()
    const n = mount(text("x"))
    const nodeSeen: string[] = []
    n.on("key", (ev) => nodeSeen.push(ev.key.name))
    actions.bind({ fn: () => true, id: "test.global", keys: "ctrl-c" })
    router.focus(n)
    const consumed = router.dispatch({ event: makeKey("c", { ctrl: true }), type: "key" })
    expect(consumed).toBe(true)
    expect(nodeSeen).toEqual(["c"])
  })

  test("bind returns an unsubscribe function", () => {
    const { actions, router } = setup()
    let hits = 0
    const off = actions.bind({ fn: () => hits++, id: "test.global", keys: "a" })
    router.dispatch({ event: makeKey("a"), type: "key" })
    expect(hits).toBe(1)
    off()
    router.dispatch({ event: makeKey("a"), type: "key" })
    expect(hits).toBe(1)
  })
})

describe("InputRouter — keymap → action dispatch", () => {
  test("keymap entry with action id fires the focused node's handler", () => {
    const { actions, mount, router } = setup()
    actions.register({ "input.cursorLeft": { keys: ["left"] } })

    const n = mount(text("t"))
    let fired = 0
    ;(n as unknown as { actions: Record<string, () => void> }).actions = {
      "input.cursorLeft": () => fired++,
    }
    router.focus(n)
    const consumed = router.dispatch({ event: makeKey("left"), type: "key" })
    expect(consumed).toBe(true)
    expect(fired).toBe(1)
  })

  test("action with catalog `fn` fires directly without walking", () => {
    const { actions, router } = setup()
    let fired = 0
    actions.register({ "global.quit": { fn: () => fired++, keys: ["ctrl-c"] } })
    const consumed = router.dispatch({ event: makeKey("c", { ctrl: true }), type: "key" })
    expect(consumed).toBe(true)
    expect(fired).toBe(1)
  })

  test("dispatch walks the focus chain for node.actions[id]", () => {
    const { actions, mount, router } = setup()
    const parent = mount(box({}))
    const child = text("c")
    parent.add(child)
    let fired = 0
    ;(parent as unknown as { actions: Record<string, () => void> }).actions = {
      "app.doit": () => fired++,
    }
    actions.register({ "app.doit": { keys: ["ctrl-d"] } })
    router.focus(child)
    router.dispatch({ event: makeKey("d", { ctrl: true }), type: "key" })
    expect(fired).toBe(1)
  })

  test("unmatched keys fall through to the raw key event", () => {
    const { actions, mount, router } = setup()
    const n = mount(text("t"))
    const seen: string[] = []
    n.on("key", (ev) => seen.push(ev.key.name))
    actions.register({ "input.foo": { keys: ["enter"] } })
    router.focus(n)
    router.dispatch({ event: makeKey("a"), type: "key" })
    expect(seen).toEqual(["a"])
  })

  test("action target takes precedence over the focused node", () => {
    const { actions, mount, router } = setup()
    const input = mount(text("input"))
    const menu = mount(text("menu"))
    const seen: string[] = []
    ;(input as unknown as { actions: Record<string, () => void> }).actions = {
      "input.submit": () => seen.push("input"),
    }
    ;(menu as unknown as { actions: Record<string, () => void> }).actions = {
      "menu.select": () => seen.push("menu"),
    }
    input.addActionTarget(menu)
    actions.register({
      "input.submit": { keys: ["enter"] },
      "menu.select": { keys: ["enter"] },
    })
    router.focus(input)
    const consumed = router.dispatch({ event: makeKey("enter"), type: "key" })
    expect(consumed).toBe(true)
    expect(seen).toEqual(["menu"])
  })
})

describe("InputRouter — paste", () => {
  test("paste events reach the focused node with the full text", () => {
    const router = new InputRouter()
    const n = text("x")
    const texts: string[] = []
    n.on("paste", (ev) => texts.push(ev.paste.text))
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
      seen.push(`child:${ev.paste.text}`)
      ev.paste.stop()
    })
    parent.on("paste", () => seen.push("parent"))
    router.focus(child)
    router.dispatch({ text: "abc", type: "paste" })
    expect(seen).toEqual(["child:abc"])
  })
})
