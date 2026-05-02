import { describe, expect, test } from "vitest"
import {
  cleanText,
  cleanTextAgent,
  cleanTextTui,
  normalizeNewlines,
  stripAdversarial,
  stripAnsi,
  stripBinary,
} from "../src/text.ts"

const ESC = "\x1B"
const SGR_RED = `${ESC}[31m`
const SGR_RESET = `${ESC}[0m`
const CURSOR_UP = `${ESC}[A`
const ERASE_LINE = `${ESC}[K`
const OSC_TITLE = `${ESC}]0;my title${ESC}\\`
const OSC_HYPERLINK = `${ESC}]8;;https://example.com${ESC}\\link${ESC}]8;;${ESC}\\`
const APC_KGP = `${ESC}_Ga=t,f=24;PAYLOAD${ESC}\\`

describe("stripAnsi", () => {
  test("strips SGR by default", () => {
    expect(stripAnsi(`${SGR_RED}hello${SGR_RESET}`)).toBe("hello")
  })

  test("strips cursor moves and erases", () => {
    expect(stripAnsi(`${CURSOR_UP}line${ERASE_LINE}`)).toBe("line")
  })

  test("strips OSC sequences (titles, hyperlinks)", () => {
    expect(stripAnsi(`prefix ${OSC_TITLE}suffix`)).toBe("prefix suffix")
    expect(stripAnsi(OSC_HYPERLINK)).toBe("link")
  })

  test("strips APC sequences (KGP image payloads)", () => {
    expect(stripAnsi(`before${APC_KGP}after`)).toBe("beforeafter")
  })

  test("preserves SGR with keepStyles: true", () => {
    const input = `${SGR_RED}red${SGR_RESET}`
    expect(stripAnsi(input, { keepStyles: true })).toBe(input)
  })

  test("strips non-SGR CSI even with keepStyles: true", () => {
    expect(stripAnsi(`${CURSOR_UP}${SGR_RED}hi${SGR_RESET}`, { keepStyles: true })).toBe(
      `${SGR_RED}hi${SGR_RESET}`,
    )
  })

  test("strips OSC and APC even with keepStyles: true", () => {
    expect(stripAnsi(`${OSC_TITLE}${APC_KGP}text`, { keepStyles: true })).toBe("text")
  })

  test("leaves plain text untouched", () => {
    expect(stripAnsi("hello world")).toBe("hello world")
  })
})

describe("stripBinary", () => {
  test("strips NUL", () => {
    expect(stripBinary("a\x00b")).toBe("ab")
  })

  test("strips C0 controls except tab/lf/cr", () => {
    expect(stripBinary("a\x01\x07\x08\x0B\x0C\x0Eb")).toBe("ab")
  })

  test("preserves tab, newline, carriage return", () => {
    expect(stripBinary("a\tb\nc\rd")).toBe("a\tb\nc\rd")
  })

  test("strips DEL (0x7F)", () => {
    expect(stripBinary("a\x7Fb")).toBe("ab")
  })

  test("strips C1 controls (0x80-0x9F)", () => {
    expect(stripBinary("a\x80\x9Fb")).toBe("ab")
  })

  test("strips ESC by default", () => {
    expect(stripBinary(`a${ESC}b`)).toBe("ab")
  })

  test("preserves ESC inside SGR sequences with keepStyles: true", () => {
    const input = `${SGR_RED}red${SGR_RESET}`
    expect(stripBinary(input, { keepStyles: true })).toBe(input)
  })

  test("strips stray ESC even with keepStyles: true", () => {
    // ESC not followed by [, ], or _ — not part of any recognized sequence.
    expect(stripBinary(`a${ESC}xb`, { keepStyles: true })).toBe("axb")
  })

  test("preserves printable ASCII and Unicode", () => {
    expect(stripBinary("hello café 😀")).toBe("hello café 😀")
  })
})

describe("stripAdversarial", () => {
  test("strips zero-width space", () => {
    expect(stripAdversarial("a​b")).toBe("ab")
  })

  test("strips zero-width joiner (breaks emoji ZWJ sequences)", () => {
    expect(stripAdversarial("‍")).toBe("")
  })

  test("strips BOM", () => {
    expect(stripAdversarial("﻿hello")).toBe("hello")
  })

  test("strips bidi explicit-overrides", () => {
    expect(stripAdversarial("a‮b‬c")).toBe("abc")
  })

  test("strips bidi isolates", () => {
    expect(stripAdversarial("a⁦b⁩c")).toBe("abc")
  })

  test("strips tag characters (supplementary plane)", () => {
    expect(stripAdversarial("a\u{E0061}b")).toBe("ab")
  })

  test("preserves regular text and emoji", () => {
    expect(stripAdversarial("hello 😀 world")).toBe("hello 😀 world")
  })
})

describe("normalizeNewlines", () => {
  test("converts CRLF to LF", () => {
    expect(normalizeNewlines("a\r\nb")).toBe("a\nb")
  })

  test("converts lone CR to LF", () => {
    expect(normalizeNewlines("a\rb")).toBe("a\nb")
  })

  test("leaves LF untouched", () => {
    expect(normalizeNewlines("a\nb")).toBe("a\nb")
  })

  test("handles mixed line endings", () => {
    expect(normalizeNewlines("a\r\nb\nc\rd")).toBe("a\nb\nc\nd")
  })

  test(String.raw`progress-bar style \r updates become separate lines`, () => {
    expect(normalizeNewlines("Downloading: 45%\rDownloading: 50%")).toBe(
      "Downloading: 45%\nDownloading: 50%",
    )
  })

  test(String.raw`output contains no \r after normalization`, () => {
    const result = normalizeNewlines("a\rb\r\nc\nd\r")
    expect(result.includes("\r")).toBe(false)
  })
})

describe("cleanText", () => {
  test("default strips ANSI, binary, normalizes newlines + Unicode", () => {
    const input = `${SGR_RED}hello${SGR_RESET}\r\nworld\x00`
    expect(cleanText(input)).toBe("hello\nworld")
  })

  test("default does NOT strip SGR styles when keepStyles: true", () => {
    const input = `${SGR_RED}hello${SGR_RESET}`
    expect(cleanText(input, { keepStyles: true })).toBe(input)
  })

  test("default does NOT strip adversarial Unicode (preserves ZWJ)", () => {
    const input = "a‍b" // ZWJ — kept by default
    expect(cleanText(input)).toBe(input)
  })

  test("opts.adversarial: true strips ZWJ and other adversarial", () => {
    expect(cleanText("a​b‍c", { adversarial: true })).toBe("abc")
  })

  test("normalizes Unicode to NFC", () => {
    // "é" composed (U+00E9) vs decomposed (U+0065 + U+0301)
    const decomposed = "é"
    const composed = "é"
    expect(cleanText(decomposed)).toBe(composed)
    expect(cleanText(decomposed).length).toBe(1)
  })

  test("all toggles off returns input unchanged", () => {
    const input = `${SGR_RED}hello\r\n\x00world`
    expect(
      cleanText(input, {
        adversarial: false,
        ansi: false,
        binary: false,
        newlines: false,
        unicode: false,
      }),
    ).toBe(input)
  })

  test("preserves tab/newline/printables in normal text", () => {
    expect(cleanText("hello\tworld\nfoo bar")).toBe("hello\tworld\nfoo bar")
  })
})

describe("cleanTextTui (preset)", () => {
  test("preserves SGR colors", () => {
    const input = `${SGR_RED}red${SGR_RESET}`
    expect(cleanTextTui(input)).toBe(input)
  })

  test("strips cursor moves and erases", () => {
    expect(cleanTextTui(`${CURSOR_UP}${SGR_RED}hi${SGR_RESET}${ERASE_LINE}`)).toBe(
      `${SGR_RED}hi${SGR_RESET}`,
    )
  })

  test("strips OSC titles (don't let source set TUI window title)", () => {
    expect(cleanTextTui(OSC_TITLE)).toBe("")
  })

  test("strips APC payloads", () => {
    expect(cleanTextTui(`before${APC_KGP}after`)).toBe("beforeafter")
  })

  test("strips NUL and other binary control bytes", () => {
    expect(cleanTextTui(`a\x00b\x07c`)).toBe("abc")
  })

  test("preserves emoji with ZWJ (no adversarial strip)", () => {
    expect(cleanTextTui("👨‍👩‍👧")).toBe("👨‍👩‍👧")
  })
})

describe("cleanTextAgent (preset)", () => {
  test("strips SGR colors (LLM doesn't render)", () => {
    expect(cleanTextAgent(`${SGR_RED}hello${SGR_RESET}`)).toBe("hello")
  })

  test("strips all ANSI categories", () => {
    expect(cleanTextAgent(`${CURSOR_UP}${SGR_RED}hi${SGR_RESET}${OSC_TITLE}${APC_KGP}`)).toBe("hi")
  })

  test("strips adversarial Unicode (zero-widths, bidi)", () => {
    expect(cleanTextAgent("a​b‮c")).toBe("abc")
  })

  test("strips emoji ZWJ (intentional — adversarial strip applies)", () => {
    // Note: this *breaks* the family emoji into individual figures.
    // Acceptable trade for LLM-bound text.
    expect(cleanTextAgent("👨‍👩‍👧")).toBe("👨👩👧")
  })

  test("normalizes newlines and binary", () => {
    expect(cleanTextAgent("a\r\nb\x00c")).toBe("a\nbc")
  })
})
