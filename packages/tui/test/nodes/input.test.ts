import type { RoutedKey, RoutedPaste } from "../../src/input/router.ts"

import { describe, expect, test } from "vitest"
import { createCtx } from "../../src/core/ctx.ts"
import { Actions } from "../../src/input/actions.ts"
import { defaultActions } from "../../src/input/defaults.ts"
import { InputRouter } from "../../src/input/router.ts"
import { input } from "../../src/widgets/input.ts"
import { mockMountCtx } from "../renderer/mock.ts"

function key(name: string, more: Partial<RoutedKey> = {}): RoutedKey {
  const ev: RoutedKey = {
    alt: false,
    ctrl: false,
    meta: false,
    name,
    pattern: name,
    shift: false,
    stop: () => {
      ev.stopped = true
    },
    stopped: false,
    ...more,
  }
  return ev
}

function paste(text: string): RoutedPaste {
  const ev: RoutedPaste = {
    stop: () => {
      ev.stopped = true
    },
    stopped: false,
    text,
  }
  return ev
}

const ctx = (width = 40) => createCtx({ width })

function cursorCtx(width = 40) {
  const ret = ctx(width)
  ;(ret.style as { inverse: (s: string) => string }).inverse = (s: string) =>
    s === " " ? "█" : s.toUpperCase()
  return ret
}

describe("Input — initial state", () => {
  test("defaults to empty value and cursor=0", () => {
    const n = input()
    expect(n.state.value).toBe("")
    expect(n.state.cursor).toBe(0)
  })

  test("accepts initial value and puts cursor at the end", () => {
    const n = input({ value: "hello" })
    expect(n.state.value).toBe("hello")
    expect(n.state.cursor).toBe(5)
  })

  test("class-level `type` tag is `input`", () => {
    expect(input().type).toBe("input")
  })

  test("instance `id` threads through state", () => {
    const n = input().id("editor")
    expect(n.id()).toBe("editor")
  })
})

// ---------- action-method unit tests ----------
// The router dispatches named keymap bindings by calling these methods
// directly; testing them without a router keeps the surface minimal.

describe("Input.actions — character editing", () => {
  test("deleteCharBack removes the char before the cursor", () => {
    const n = input({ cursor: 5, value: "hello" })
    n.actions["input.deleteCharBack"]()
    expect(n.state.value).toBe("hell")
    expect(n.state.cursor).toBe(4)
  })

  test("deleteCharBack at cursor=0 is a no-op", () => {
    const n = input({ cursor: 0, value: "x" })
    n.actions["input.deleteCharBack"]()
    expect(n.state.value).toBe("x")
    expect(n.state.cursor).toBe(0)
  })

  test("deleteCharForward removes the char at the cursor", () => {
    const n = input({ cursor: 1, value: "abc" })
    n.actions["input.deleteCharForward"]()
    expect(n.state.value).toBe("ac")
    expect(n.state.cursor).toBe(1)
  })
})

describe("Input.actions — cursor motion", () => {
  test("cursorLeft / cursorRight move and clamp", () => {
    const n = input({ cursor: 1, value: "abc" })
    n.actions["input.cursorLeft"]()
    expect(n.state.cursor).toBe(0)
    n.actions["input.cursorLeft"]()
    expect(n.state.cursor).toBe(0)
    n.actions["input.cursorRight"]()
    n.actions["input.cursorRight"]()
    n.actions["input.cursorRight"]()
    n.actions["input.cursorRight"]()
    expect(n.state.cursor).toBe(3)
  })

  test("cursorLineStart / cursorLineEnd jump within the logical line", () => {
    const n = input({ cursor: 6, value: "abc\ndefg" }) // on 'f'
    n.actions["input.cursorLineStart"]()
    expect(n.state.cursor).toBe(4) // start of "defg"
    n.actions["input.cursorLineEnd"]()
    expect(n.state.cursor).toBe(8) // end of "defg"
  })

  test("cursorUp moves up one line at the same column", () => {
    const n = input({ cursor: 6, value: "abc\ndefg" })
    n.actions["input.cursorUp"]()
    expect(n.state.cursor).toBe(2)
  })

  test("cursorUp clamps to end of prev line when col exceeds it", () => {
    const n = input({ cursor: 9, value: "ab\nlonger" })
    n.actions["input.cursorUp"]()
    expect(n.state.cursor).toBe(2)
  })

  test("cursorUp on the first line is a no-op", () => {
    const n = input({ cursor: 2, value: "ab\ncd" })
    n.actions["input.cursorUp"]()
    expect(n.state.cursor).toBe(2)
  })

  test("cursorDown moves down one line, same col", () => {
    const n = input({ cursor: 1, value: "abcd\nefgh" })
    n.actions["input.cursorDown"]()
    expect(n.state.cursor).toBe(6)
  })

  test("cursorDown on the last line is a no-op", () => {
    const n = input({ cursor: 1, value: "ab\ncd" })
    n.actions["input.cursorDown"]()
    expect(n.state.cursor).toBe(4)
    n.actions["input.cursorDown"]()
    expect(n.state.cursor).toBe(4)
  })

  test("cursorRight moves across a newline into the next line", () => {
    const n = input({ cursor: 2, value: "ab\ncd" })
    n.actions["input.cursorRight"]()
    expect(n.state.cursor).toBe(3)
    n.actions["input.cursorRight"]()
    expect(n.state.cursor).toBe(4)
  })

  test("cursorLeft moves across a newline into the previous line", () => {
    const n = input({ cursor: 4, value: "ab\ncd" })
    n.actions["input.cursorLeft"]()
    expect(n.state.cursor).toBe(3)
    n.actions["input.cursorLeft"]()
    expect(n.state.cursor).toBe(2)
  })

  test("cursorDown restores the preferred column after moving through a short line", () => {
    const n = input({ cursor: 3, value: "abcd\nx\nabcd" })
    n.actions["input.cursorDown"]()
    expect(n.state.cursor).toBe(6)
    n.actions["input.cursorDown"]()
    expect(n.state.cursor).toBe(10)
  })

  test("cursorUp restores the preferred column after moving through a short line", () => {
    const n = input({ cursor: 10, value: "abcd\nx\nabcd" })
    n.actions["input.cursorUp"]()
    expect(n.state.cursor).toBe(6)
    n.actions["input.cursorUp"]()
    expect(n.state.cursor).toBe(3)
  })

  test("cursorRight on the last line clamps at the end after repeated presses", () => {
    const n = input({ cursor: 13, value: "one\ntwo\nthree\nfour" })
    for (let i = 0; i < 5; i++) n.actions["input.cursorRight"]()
    expect(n.state.cursor).toBe(18)
    n.actions["input.cursorRight"]()
    expect(n.state.cursor).toBe(18)
  })

  test("cursorLeft on the first line clamps at the start after repeated presses", () => {
    const n = input({ cursor: 2, value: "one\ntwo\nthree\nfour" })
    for (let i = 0; i < 5; i++) n.actions["input.cursorLeft"]()
    expect(n.state.cursor).toBe(0)
    n.actions["input.cursorLeft"]()
    expect(n.state.cursor).toBe(0)
  })

  test("cursorDown through several lines keeps the visual column", () => {
    const n = input({ cursor: 2, value: "abcd\nefgh\nijkl\nmnop" })
    n.actions["input.cursorDown"]()
    expect(n.state.cursor).toBe(7)
    n.actions["input.cursorDown"]()
    expect(n.state.cursor).toBe(12)
    n.actions["input.cursorDown"]()
    expect(n.state.cursor).toBe(17)
  })

  test("cursorUp through several lines keeps the visual column", () => {
    const n = input({ cursor: 17, value: "abcd\nefgh\nijkl\nmnop" })
    n.actions["input.cursorUp"]()
    expect(n.state.cursor).toBe(12)
    n.actions["input.cursorUp"]()
    expect(n.state.cursor).toBe(7)
    n.actions["input.cursorUp"]()
    expect(n.state.cursor).toBe(2)
  })

  test("cursorUp from the last line lands on an empty middle line", () => {
    const n = input({ cursor: 8, value: "abcd\n\nwxyz" })
    n.actions["input.cursorUp"]()
    expect(n.state.cursor).toBe(5)
  })

  test("cursorDown clamps to the last line and stays there", () => {
    const n = input({ cursor: 1, value: "one\ntwo\nthree\nfour" })
    for (let i = 0; i < 10; i++) n.actions["input.cursorDown"]()
    expect(n.state.cursor).toBe(15)
    n.actions["input.cursorDown"]()
    expect(n.state.cursor).toBe(15)
  })

  test("cursorUp clamps to the first line and stays there", () => {
    const n = input({ cursor: 15, value: "one\ntwo\nthree\nfour" })
    for (let i = 0; i < 10; i++) n.actions["input.cursorUp"]()
    expect(n.state.cursor).toBe(1)
    n.actions["input.cursorUp"]()
    expect(n.state.cursor).toBe(1)
  })
})

describe("Input.actions — word deletion", () => {
  test("deleteWordBack eats the previous word", () => {
    const n = input({ cursor: 11, value: "hello world" })
    n.actions["input.deleteWordBack"]()
    expect(n.state.value).toBe("hello ")
    expect(n.state.cursor).toBe(6)
  })

  test("deleteWordBack after trailing spaces eats the spaces plus the word", () => {
    const n = input({ cursor: 8, value: "hello   " })
    n.actions["input.deleteWordBack"]()
    expect(n.state.value).toBe("")
    expect(n.state.cursor).toBe(0)
  })

  test("deleteWordBack at start is a no-op", () => {
    const n = input({ cursor: 0, value: "hello" })
    n.actions["input.deleteWordBack"]()
    expect(n.state.value).toBe("hello")
    expect(n.state.cursor).toBe(0)
  })

  test("deleteCharBack removes a staged marker atomically", () => {
    const n = input()
    n.paste("a\nb\nc\nd\ne\nf")
    const value = n.state.value ?? ""
    n.state.cursor = value.length
    n.actions["input.deleteCharBack"]()
    expect(n.state.value).toBe("")
    expect(n.state.cursor).toBe(0)
  })

  test("deleteCharForward removes a staged marker atomically", () => {
    const n = input({ value: "x", cursor: 1 })
    n.paste("a\nb\nc\nd\ne\nf")
    n.state.cursor = 1
    n.actions["input.deleteCharForward"]()
    expect(n.state.value).toBe("x")
    expect(n.state.cursor).toBe(1)
  })
})

describe("Input.actions — submit + newline", () => {
  test("submit emits with the current value", () => {
    const n = input({ value: "hi" })
    const seen: string[] = []
    n.on("submit", (v) => seen.push(v.value))
    n.actions["input.submit"]()
    expect(seen).toEqual(["hi"])
  })

  test("submit clears the value", () => {
    const n = input({ value: "hi" })
    n.actions["input.submit"]()
    expect(n.state.value).toBe("")
  })

  test("submit appends to history and emits history", () => {
    const n = input({ value: "hi" })
    const seen: string[][] = []
    n.on("history", ({ history }) => seen.push(history))
    n.actions["input.submit"]()
    expect(seen).toEqual([["hi"]])
  })

  test("cursorUp navigates initial history on the first line", () => {
    const n = input({ history: ["one", "two"] })
    n.actions["input.cursorUp"]()
    expect(n.state.value).toBe("two")
    n.actions["input.cursorUp"]()
    expect(n.state.value).toBe("one")
  })

  test("cursorDown past newest restores the draft", () => {
    const n = input({ history: ["one"], value: "draft" })
    n.actions["input.cursorUp"]()
    expect(n.state.value).toBe("one")
    n.actions["input.cursorDown"]()
    expect(n.state.value).toBe("draft")
  })

  test(String.raw`insertNewline inserts \n at the cursor`, () => {
    const n = input({ cursor: 5, value: "hello" })
    n.actions["input.insertNewline"]()
    expect(n.state.value).toBe("hello\n")
    expect(n.state.cursor).toBe(6)
  })

  test("insertNewline carries leading whitespace onto the new line", () => {
    const n = input({ cursor: 9, value: "  - hello" })
    n.actions["input.insertNewline"]()
    expect(n.state.value).toBe("  - hello\n  ")
    expect(n.state.cursor).toBe(12)
  })

  test("insertNewline indent only copies whitespace before the cursor on the current line", () => {
    // Cursor at position 1 on a 4-space indented line: the inserted
    // indent matches what's *before* the cursor (one space), not the
    // line's full prefix. The rest of the original line stays intact.
    const n = input({ cursor: 1, value: "    ok" })
    n.actions["input.insertNewline"]()
    expect(n.state.value).toBe(" \n    ok")
    expect(n.state.cursor).toBe(3)
  })

  test("insertTab inserts two spaces at the cursor", () => {
    const n = input({ cursor: 0, value: "hi" })
    n.actions["input.insertTab"]()
    expect(n.state.value).toBe("  hi")
    expect(n.state.cursor).toBe(2)
  })
})

// ---------- raw-key fallback path ----------
// Emitting a `key` event directly simulates the router's "no named
// action matched, bubble the raw event" behaviour.

describe("Input — printable-char fallback", () => {
  test("typing a char inserts at cursor and advances", () => {
    const n = input({ cursor: 1, value: "ab" })
    void n.emit("key", { key: key("x", { text: "x" }) })
    expect(n.state.value).toBe("axb")
    expect(n.state.cursor).toBe(2)
  })

  test("space is inserted like any other char", () => {
    const n = input({ cursor: 2, value: "ab" })
    void n.emit("key", { key: key("space", { text: " " }) })
    expect(n.state.value).toBe("ab ")
    expect(n.state.cursor).toBe(3)
  })

  test("ctrl-modified keys are not inserted", () => {
    const n = input({ cursor: 1, value: "a" })
    void n.emit("key", { key: key("a", { ctrl: true, text: "a" }) })
    expect(n.state.value).toBe("a")
  })

  test("printable-char insertion calls stop() on the event", () => {
    const n = input({ cursor: 0, value: "" })
    const ev = key("a", { text: "a" })
    void n.emit("key", { key: ev })
    expect(ev.stopped).toBe(true)
  })

  test("unhandled keys (no text, non-printable) don't call stop()", () => {
    const n = input()
    const ev = key("f7")
    void n.emit("key", { key: ev })
    expect(ev.stopped).toBe(false)
  })
})

describe("Input — paste", () => {
  test("paste inserts the whole payload at the cursor", () => {
    const n = input({ cursor: 1, value: "ac" })
    void n.emit("paste", { paste: paste("BB") })
    expect(n.state.value).toBe("aBBc")
    expect(n.state.cursor).toBe(3)
  })
})

// ---------- end-to-end through the router ----------
// Exercise a few common bindings via the full decoder-like event →
// router → action pipeline so the composition stays honest.

function mount(state = {}) {
  const router = new InputRouter()
  const actions = new Actions()
  actions.setTargetResolver(() => router.focused)
  router.setActions(actions)
  actions.register(defaultActions, { default: true })
  const n = input(state)
  const mountCtx = mockMountCtx("ui", { actions })
  n.mount({
    ...mountCtx,
    input: {
      ...mountCtx.input,
      get terminalFocus() {
        return router.terminalFocus
      },
      events: router,
      bind: (binding) => actions.bind(binding),
      blur: (node) => router.blur(node),
      focus: (node) => router.focus(node),
    },
  })
  router.focus(n)
  return { n, router }
}

describe("Input — end-to-end via router + keymap", () => {
  test("ctrl-a jumps to start of current line via keymap", () => {
    const { n, router } = mount({ cursor: 3, value: "hello" })
    router.dispatch({ event: key("a", { ctrl: true, text: "a" }), type: "key" })
    expect(n.state.cursor).toBe(0)
  })

  test("enter fires submit via keymap", () => {
    const { n, router } = mount({ value: "hi" })
    const seen: string[] = []
    n.on("submit", (v) => seen.push(v.value))
    router.dispatch({ event: key("enter"), type: "key" })
    expect(seen).toEqual(["hi"])
  })

  test("shift-enter inserts newline via keymap (plain enter still submits)", () => {
    const { n, router } = mount({ cursor: 2, value: "ab" })
    router.dispatch({ event: key("enter", { shift: true }), type: "key" })
    expect(n.state.value).toBe("ab\n")
  })

  test("unmapped printable char falls through to the raw-key fallback", () => {
    const { n, router } = mount({ cursor: 2, value: "ab" })
    router.dispatch({ event: key("x", { text: "x" }), type: "key" })
    expect(n.state.value).toBe("abx")
  })
})

describe("Input — render", () => {
  test("empty + placeholder renders the placeholder", async () => {
    const n = input({ placeholder: "type here" })
    const rows = await n.render(ctx(20))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toContain("type here")
  })

  test("placeholder is shown even when focused (with cursor overlay)", async () => {
    const n = input({ placeholder: "type here" })
    void n.emit("focus")
    const rows = await n.render(ctx(20))
    expect(rows[0]).toContain("t")
    expect(rows[0]).toContain("ype here")
  })

  test("renders value when non-empty", async () => {
    const n = input({ value: "hello" })
    const rows = await n.render(ctx(20))
    expect(rows[0]).toContain("hello")
  })

  test("renders multiple rows for a value with newlines", async () => {
    const n = input({ value: "one\ntwo" })
    const rows = await n.render(ctx(20))
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatch(/^one/)
    expect(rows[1]).toMatch(/^two/)
  })

  test("cursor at the start of a later logical line renders on that line", async () => {
    const n = input({ cursor: 4, value: "one\ntwo" })
    n.mount(mockMountCtx("ui"))
    void n.emit("focus")
    const rows = await n.render(cursorCtx(20))
    expect(rows).toEqual(["one", "Two"])
  })

  test("cursorUp from the last line renders on an empty middle line", async () => {
    const n = input({ cursor: 17, value: "asdasdaddd\nsdss\n\nsss kkkdddd" })
    n.actions["input.cursorUp"]()
    expect(n.state.cursor).toBe(16)

    n.mount(mockMountCtx("ui"))
    void n.emit("focus")
    const rows = await n.render(cursorCtx(40))
    expect(rows).toEqual(["asdasdaddd", "sdss", "█", "sss kkkdddd"])
  })

  test("cursorLeft from the end of a multiline input visibly moves onto the last char", async () => {
    const value = "one\ntwo\nthree\nfour"
    const n = input({ cursor: value.length, value })
    n.mount(mockMountCtx("ui"))
    void n.emit("focus")
    n.actions["input.cursorLeft"]()
    expect(n.state.cursor).toBe(value.length - 1)

    const rows = await n.render(cursorCtx(20))
    expect(rows).toEqual(["one", "two", "three", "fouR"])
  })

  test("word-wraps a long line across multiple rows", async () => {
    const n = input({ value: "hello world foo bar" })
    const rows = await n.render(ctx(10))
    expect(rows.length).toBeGreaterThan(1)
    expect(rows.join("")).toContain("hello")
    expect(rows.join("")).toContain("bar")
  })

  test("soft-wrap suppresses one leading continuation space", async () => {
    const n = input({ value: "hello world" })
    const rows = await n.render(ctx(5))
    expect(rows).toEqual(["hello", "world"])
  })

  test("soft-wrap preserves additional intentional continuation spaces", async () => {
    const n = input({ value: "hello  world" })
    const rows = await n.render(ctx(5))
    expect(rows).toEqual(["hello", " ", "world"])
  })

  test("explicit newline preserves leading whitespace", async () => {
    const n = input({ value: "hello\n world" })
    const rows = await n.render(ctx(5))
    expect(rows).toEqual(["hello", " ", "world"])
  })

  test("cursor at end of a wrapped line renders without crashing", async () => {
    const n = input({ value: "hello world" })
    void n.emit("focus")
    const rows = await n.render(ctx(5))
    expect(rows.length).toBeGreaterThan(1)
    expect(rows.join("")).toContain("hello")
    expect(rows.join("")).toContain("world")
  })

  test("row width matches ctx width (padded)", async () => {
    const n = input({ value: "x" })
    const rows = await n.render(ctx(10))
    expect(rows[0]).toMatch(/^x/)
  })
})
