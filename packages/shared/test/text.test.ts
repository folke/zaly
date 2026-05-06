import { describe, expect, test } from "vitest"
import {
  cleanText,
  cleanTextAgent,
  cleanTextTui,
  detectEol,
  normalizeEol,
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
      `${SGR_RED}hi${SGR_RESET}`
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
  test(String.raw`escapes NUL as literal \0 (preserves field separators)`, () => {
    expect(stripBinary("a\x00b")).toBe(String.raw`a\0b`)
  })

  test("preserves field separation for find -print0 style output", () => {
    expect(stripBinary("path1\x00path2\x00path3")).toBe(String.raw`path1\0path2\0path3`)
  })

  test(String.raw`nul opt overrides default (custom replacement)`, () => {
    expect(stripBinary("a\x00b", { nul: "" })).toBe("ab")
    expect(stripBinary("a\x00b", { nul: "\n" })).toBe("a\nb")
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

describe("normalizeEol", () => {
  test("converts CRLF to LF by default", () => {
    expect(normalizeEol("a\r\nb")).toBe("a\nb")
  })

  test("leaves LF untouched", () => {
    expect(normalizeEol("a\nb")).toBe("a\nb")
  })

  test("preserves lone CR by default", () => {
    expect(normalizeEol("a\rb")).toBe("a\rb")
  })

  test(String.raw`loneCr: "\n" treats lone CR as line ending`, () => {
    expect(normalizeEol("a\rb", { loneCr: "\n" })).toBe("a\nb")
  })

  test(String.raw`loneCr: "" drops lone CR entirely`, () => {
    expect(normalizeEol("a\rb", { loneCr: "" })).toBe("ab")
  })

  test("custom eol target re-emits CRLF", () => {
    expect(normalizeEol("a\nb\r\nc", { eol: "\r\n" })).toBe("a\r\nb\r\nc")
  })

  test("loneCr handling is independent of eol target", () => {
    expect(normalizeEol("a\rb\r\nc", { eol: "\r\n", loneCr: "\r\n" })).toBe("a\r\nb\r\nc")
  })

  test(String.raw`progress-bar style \r becomes separate lines when loneCr opted in`, () => {
    expect(normalizeEol("Downloading: 45%\rDownloading: 50%", { loneCr: "\n" })).toBe(
      "Downloading: 45%\nDownloading: 50%"
    )
  })
})

describe("detectEol", () => {
  test("defaults to LF for new file with text extension", () => {
    expect(detectEol({ path: "/tmp/foo.ts" })).toBe("\n")
    expect(detectEol({ path: "/tmp/script.sh" })).toBe("\n")
    expect(detectEol({ path: "/tmp/Makefile" })).toBe("\n")
  })

  test("defaults to CRLF for Windows script extensions", () => {
    expect(detectEol({ path: "/tmp/build.bat" })).toBe("\r\n")
    expect(detectEol({ path: "/tmp/run.cmd" })).toBe("\r\n")
    expect(detectEol({ path: "/tmp/keys.reg" })).toBe("\r\n")
  })

  test("extension match is case-insensitive", () => {
    expect(detectEol({ path: "/tmp/build.BAT" })).toBe("\r\n")
  })

  test("detects CRLF from existing content", () => {
    expect(detectEol("a\r\nb\r\nc")).toBe("\r\n")
  })

  test("detects LF from existing content", () => {
    expect(detectEol("a\nb\nc")).toBe("\n")
  })

  test("majority wins on mixed line endings", () => {
    expect(detectEol("a\r\nb\r\nc\nd")).toBe("\r\n")
    expect(detectEol("a\r\nb\nc\nd")).toBe("\n")
  })

  test("ignores standalone CR when counting LFs (lookbehind)", () => {
    expect(detectEol("a\nb\nc\nd\re")).toBe("\n")
  })

  test("empty / no-newline content with no path defaults to LF", () => {
    expect(detectEol("")).toBe("\n")
    expect(detectEol("no newlines here")).toBe("\n")
  })

  test("falls back to extension when text has no line endings", () => {
    expect(detectEol({ path: "/tmp/build.bat", text: "no newlines" })).toBe("\r\n")
  })

  test("text wins over default-CRLF extension when content has line endings", () => {
    expect(detectEol({ path: "/tmp/build.bat", text: "a\nb\nc\n" })).toBe("\n")
  })

  test("force-CRLF extension (.reg) overrides existing LF content", () => {
    // .reg parsers (regedit) reject mixed/LF input — force CRLF regardless.
    expect(detectEol({ path: "/tmp/keys.reg", text: "a\nb\nc\n" })).toBe("\r\n")
    expect(detectEol({ path: "/tmp/keys.reg" })).toBe("\r\n")
  })

  test("force-CRLF check is case-insensitive", () => {
    expect(detectEol({ path: "/tmp/keys.REG", text: "a\nb\n" })).toBe("\r\n")
  })
})

describe("cleanText", () => {
  test("default strips ANSI, normalizes newlines, escapes NUL as literal", () => {
    const input = `${SGR_RED}hello${SGR_RESET}\r\nworld\x00`
    expect(cleanText(input)).toBe("hello\nworld\\0")
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
        eol: false,
        unicode: false,
      })
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
      `${SGR_RED}hi${SGR_RESET}`
    )
  })

  test("strips OSC titles (don't let source set TUI window title)", () => {
    expect(cleanTextTui(OSC_TITLE)).toBe("")
  })

  test("strips APC payloads", () => {
    expect(cleanTextTui(`before${APC_KGP}after`)).toBe("beforeafter")
  })

  test("escapes NUL as literal, strips other binary control bytes", () => {
    expect(cleanTextTui(`a\x00b\x07c`)).toBe(String.raw`a\0bc`)
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

  test("normalizes newlines and escapes NUL", () => {
    expect(cleanTextAgent("a\r\nb\x00c")).toBe("a\nb\\0c")
  })
})
