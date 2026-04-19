import type { KeyEvent } from "../../src/input/keys.ts"

import { describe, expect, test } from "vitest"
import { keyMatches } from "../../src/input/keys.ts"

// Minimal builder — explicit modifiers so test intent is obvious.
function k(name: string, mods: Partial<KeyEvent> = {}): KeyEvent {
  return {
    alt: false,
    ctrl: false,
    meta: false,
    name,
    shift: false,
    ...mods,
  }
}

describe("keyMatches", () => {
  test("plain char matches its name", () => {
    expect(keyMatches(k("a"), "a")).toBe(true)
    expect(keyMatches(k("a"), "b")).toBe(false)
  })

  test("ctrl combos via `ctrl-` prefix", () => {
    expect(keyMatches(k("c", { ctrl: true }), "ctrl-c")).toBe(true)
    expect(keyMatches(k("c"), "ctrl-c")).toBe(false)
    expect(keyMatches(k("c", { ctrl: true }), "c")).toBe(false)
  })

  test("alt via `alt-` prefix", () => {
    expect(keyMatches(k("x", { alt: true }), "alt-x")).toBe(true)
  })

  test("shift via `shift-` prefix", () => {
    expect(keyMatches(k("tab", { shift: true }), "shift-tab")).toBe(true)
  })

  test("meta via `meta-` prefix", () => {
    expect(keyMatches(k("k", { meta: true }), "meta-k")).toBe(true)
  })

  test("multiple modifiers — order-independent", () => {
    const ev = k("x", { ctrl: true, shift: true })
    expect(keyMatches(ev, "ctrl-shift-x")).toBe(true)
    expect(keyMatches(ev, "shift-ctrl-x")).toBe(true)
  })

  test("unspecified modifiers must be absent", () => {
    // An event with ctrl set must not match a bare pattern.
    expect(keyMatches(k("a", { ctrl: true }), "a")).toBe(false)
    // And a plain event must not match a modifier-prefixed pattern.
    expect(keyMatches(k("a"), "ctrl-a")).toBe(false)
  })

  test("special key names", () => {
    expect(keyMatches(k("enter"), "enter")).toBe(true)
    expect(keyMatches(k("up"), "up")).toBe(true)
    expect(keyMatches(k("backspace"), "backspace")).toBe(true)
  })

  test("pattern is case-sensitive for letters (matches raw char)", () => {
    expect(keyMatches(k("a"), "A")).toBe(false)
    expect(keyMatches(k("A", { shift: true }), "A")).toBe(false) // needs shift-A
    expect(keyMatches(k("A", { shift: true }), "shift-A")).toBe(true)
  })

  test("accepts any of multiple patterns when passed as array", () => {
    expect(keyMatches(k("q"), ["q", "ctrl-c"])).toBe(true)
    expect(keyMatches(k("c", { ctrl: true }), ["q", "ctrl-c"])).toBe(true)
    expect(keyMatches(k("x"), ["q", "ctrl-c"])).toBe(false)
  })

  test("unrecognised modifier-looking prefix falls through as the key name", () => {
    // `"foo-bar"` is not a modifier combo — parser keeps it as the name.
    // The event's name must literally be "foo-bar" to match. The string
    // isn't a `KeyPattern` literal so we cast to exercise the parser's
    // tolerance for unrecognised prefixes.
    const p = "foo-bar" as unknown as Parameters<typeof keyMatches>[1]
    expect(keyMatches(k("foo-bar"), p)).toBe(true)
    expect(keyMatches(k("bar"), p)).toBe(false)
  })
})
