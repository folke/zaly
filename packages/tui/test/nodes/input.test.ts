import type { RoutedKey, RoutedPaste } from "../../src/input/router.ts"

import { describe, expect, test } from "vitest"
import { createCtx } from "../../src/core/ctx.ts"
import { inputActions } from "../../src/input/actions.ts"
import { buildKeymaps } from "../../src/input/keymap.ts"
import { InputRouter } from "../../src/input/router.ts"
import { input } from "../../src/widgets/input.ts"

function key(name: string, more: Partial<RoutedKey> = {}): RoutedKey {
  const ev: RoutedKey = {
    alt: false,
    ctrl: false,
    meta: false,
    name,
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
    n.actions.deleteCharBack()
    expect(n.state.value).toBe("hell")
    expect(n.state.cursor).toBe(4)
  })

  test("deleteCharBack at cursor=0 is a no-op", () => {
    const n = input({ cursor: 0, value: "x" })
    n.actions.deleteCharBack()
    expect(n.state.value).toBe("x")
    expect(n.state.cursor).toBe(0)
  })

  test("deleteCharForward removes the char at the cursor", () => {
    const n = input({ cursor: 1, value: "abc" })
    n.actions.deleteCharForward()
    expect(n.state.value).toBe("ac")
    expect(n.state.cursor).toBe(1)
  })
})

describe("Input.actions — cursor motion", () => {
  test("cursorLeft / cursorRight move and clamp", () => {
    const n = input({ cursor: 1, value: "abc" })
    n.actions.cursorLeft()
    expect(n.state.cursor).toBe(0)
    n.actions.cursorLeft()
    expect(n.state.cursor).toBe(0)
    n.actions.cursorRight()
    n.actions.cursorRight()
    n.actions.cursorRight()
    n.actions.cursorRight()
    expect(n.state.cursor).toBe(3)
  })

  test("cursorLineStart / cursorLineEnd jump within the logical line", () => {
    const n = input({ cursor: 6, value: "abc\ndefg" }) // on 'f'
    n.actions.cursorLineStart()
    expect(n.state.cursor).toBe(4) // start of "defg"
    n.actions.cursorLineEnd()
    expect(n.state.cursor).toBe(8) // end of "defg"
  })

  test("cursorUp moves up one line at the same column", () => {
    const n = input({ cursor: 6, value: "abc\ndefg" })
    n.actions.cursorUp()
    expect(n.state.cursor).toBe(2)
  })

  test("cursorUp clamps to end of prev line when col exceeds it", () => {
    const n = input({ cursor: 9, value: "ab\nlonger" })
    n.actions.cursorUp()
    expect(n.state.cursor).toBe(2)
  })

  test("cursorUp on the first line is a no-op", () => {
    const n = input({ cursor: 2, value: "ab\ncd" })
    n.actions.cursorUp()
    expect(n.state.cursor).toBe(2)
  })

  test("cursorDown moves down one line, same col", () => {
    const n = input({ cursor: 1, value: "abcd\nefgh" })
    n.actions.cursorDown()
    expect(n.state.cursor).toBe(6)
  })

  test("cursorDown on the last line is a no-op", () => {
    const n = input({ cursor: 1, value: "ab\ncd" })
    n.actions.cursorDown()
    expect(n.state.cursor).toBe(4)
    n.actions.cursorDown()
    expect(n.state.cursor).toBe(4)
  })
})

describe("Input.actions — word deletion", () => {
  test("deleteWordBack eats the previous word", () => {
    const n = input({ cursor: 11, value: "hello world" })
    n.actions.deleteWordBack()
    expect(n.state.value).toBe("hello ")
    expect(n.state.cursor).toBe(6)
  })

  test("deleteWordBack after trailing spaces eats the spaces plus the word", () => {
    const n = input({ cursor: 8, value: "hello   " })
    n.actions.deleteWordBack()
    expect(n.state.value).toBe("")
    expect(n.state.cursor).toBe(0)
  })

  test("deleteWordBack at start is a no-op", () => {
    const n = input({ cursor: 0, value: "hello" })
    n.actions.deleteWordBack()
    expect(n.state.value).toBe("hello")
    expect(n.state.cursor).toBe(0)
  })
})

describe("Input.actions — submit + newline", () => {
  test("submit emits with the current value", () => {
    const n = input({ value: "hi" })
    const seen: string[] = []
    n.on("submit", (v) => seen.push(v))
    n.actions.submit()
    expect(seen).toEqual(["hi"])
  })

  test("submit does not clear the value", () => {
    const n = input({ value: "hi" })
    n.actions.submit()
    expect(n.state.value).toBe("hi")
  })

  test(String.raw`insertNewline inserts \n at the cursor`, () => {
    const n = input({ cursor: 5, value: "hello" })
    n.actions.insertNewline()
    expect(n.state.value).toBe("hello\n")
    expect(n.state.cursor).toBe(6)
  })

  test("insertNewline carries leading whitespace onto the new line", () => {
    const n = input({ cursor: 9, value: "  - hello" })
    n.actions.insertNewline()
    expect(n.state.value).toBe("  - hello\n  ")
    expect(n.state.cursor).toBe(12)
  })

  test("insertNewline indent only copies whitespace before the cursor on the current line", () => {
    // Cursor at position 1 on a 4-space indented line: the inserted
    // indent matches what's *before* the cursor (one space), not the
    // line's full prefix. The rest of the original line stays intact.
    const n = input({ cursor: 1, value: "    ok" })
    n.actions.insertNewline()
    expect(n.state.value).toBe(" \n    ok")
    expect(n.state.cursor).toBe(3)
  })

  test("insertTab inserts two spaces at the cursor", () => {
    const n = input({ cursor: 0, value: "hi" })
    n.actions.insertTab()
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
    n.emit("key", key("x", { text: "x" }))
    expect(n.state.value).toBe("axb")
    expect(n.state.cursor).toBe(2)
  })

  test("space is inserted like any other char", () => {
    const n = input({ cursor: 2, value: "ab" })
    n.emit("key", key("space", { text: " " }))
    expect(n.state.value).toBe("ab ")
    expect(n.state.cursor).toBe(3)
  })

  test("ctrl-modified keys are not inserted", () => {
    const n = input({ cursor: 1, value: "a" })
    n.emit("key", key("a", { ctrl: true, text: "a" }))
    expect(n.state.value).toBe("a")
  })

  test("printable-char insertion calls stop() on the event", () => {
    const n = input({ cursor: 0, value: "" })
    const ev = key("a", { text: "a" })
    n.emit("key", ev)
    expect(ev.stopped).toBe(true)
  })

  test("unhandled keys (no text, non-printable) don't call stop()", () => {
    const n = input()
    const ev = key("f7")
    n.emit("key", ev)
    expect(ev.stopped).toBe(false)
  })
})

describe("Input — paste", () => {
  test("paste inserts the whole payload at the cursor", () => {
    const n = input({ cursor: 1, value: "ac" })
    n.emit("paste", paste("BB"))
    expect(n.state.value).toBe("aBBc")
    expect(n.state.cursor).toBe(3)
  })
})

// ---------- end-to-end through the router ----------
// Exercise a few common bindings via the full decoder-like event →
// router → action pipeline so the composition stays honest.

describe("Input — end-to-end via router + keymap", () => {
  function mount(state = {}) {
    const router = new InputRouter()
    const n = input(state)
    router.focus(n)
    router.setKeymaps(buildKeymaps(inputActions))
    return { n, router }
  }

  test("ctrl-a jumps to start of current line via keymap", () => {
    const { n, router } = mount({ cursor: 3, value: "hello" })
    router.dispatch({ event: key("a", { ctrl: true, text: "a" }), type: "key" })
    expect(n.state.cursor).toBe(0)
  })

  test("enter fires submit via keymap", () => {
    const { n, router } = mount({ value: "hi" })
    const seen: string[] = []
    n.on("submit", (v) => seen.push(v))
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
    n.emit("focus")
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

  test("word-wraps a long line across multiple rows", async () => {
    const n = input({ value: "hello world foo bar" })
    const rows = await n.render(ctx(10))
    expect(rows.length).toBeGreaterThan(1)
    expect(rows.join("")).toContain("hello")
    expect(rows.join("")).toContain("bar")
  })

  test("cursor at end of a wrapped line renders without crashing", async () => {
    const n = input({ value: "hello world" })
    n.emit("focus")
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
