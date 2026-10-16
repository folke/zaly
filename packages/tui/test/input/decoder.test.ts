import { describe, expect, test } from "vitest"
import { Decoder } from "../../src/input/decoder.ts"

// Tiny assertion helpers to keep test cases focused on the event shapes.
function keys(d: Decoder, bytes: string): { name: string; mods: string }[] {
  const out: { name: string; mods: string }[] = []
  for (const ev of d.feed(bytes)) {
    if (ev.type !== "key") throw new Error(`expected key event, got ${ev.type}`)
    const mods = [
      ev.event.ctrl && "c",
      ev.event.alt && "a",
      ev.event.shift && "s",
      ev.event.meta && "m",
    ]
      .filter(Boolean)
      .join("")
    out.push({ mods, name: ev.event.name })
  }
  return out
}

describe("Decoder — plain characters", () => {
  test("prints ASCII letter as a key with that name", () => {
    expect(keys(new Decoder(), "a")).toEqual([{ mods: "", name: "a" }])
  })

  test("several chars in one chunk yield several events", () => {
    expect(keys(new Decoder(), "abc")).toEqual([
      { mods: "", name: "a" },
      { mods: "", name: "b" },
      { mods: "", name: "c" },
    ])
  })

  test("uppercase (shifted) letter — name is the uppercase char, shift set", () => {
    // Terminals already encode Shift+a as the literal "A" byte; we only
    // set the shift flag (derived from "A" being uppercase letter) so
    // keyMatches("s-A") works.
    expect(keys(new Decoder(), "A")).toEqual([{ mods: "s", name: "A" }])
  })

  test("space character is keyed as 'space' with text=' '", () => {
    const evs = new Decoder().feed(" ")
    expect(evs).toHaveLength(1)
    expect(evs[0]).toEqual({
      event: { alt: false, ctrl: false, meta: false, name: "space", shift: false, text: " " },
      type: "key",
    })
  })
})

describe("Decoder — control characters", () => {
  test("ctrl+c via 0x03", () => {
    expect(keys(new Decoder(), "\x03")).toEqual([{ mods: "c", name: "c" }])
  })

  test("enter via 0x0d", () => {
    expect(keys(new Decoder(), "\r")).toEqual([{ mods: "", name: "enter" }])
  })

  test("tab via 0x09", () => {
    expect(keys(new Decoder(), "\t")).toEqual([{ mods: "", name: "tab" }])
  })

  test("backspace via 0x7f", () => {
    expect(keys(new Decoder(), "\x7f")).toEqual([{ mods: "", name: "backspace" }])
  })

  test("ctrl-a via 0x01", () => {
    expect(keys(new Decoder(), "\x01")).toEqual([{ mods: "c", name: "a" }])
  })
})

describe("Decoder — CSI sequences", () => {
  test("arrow up via ESC [ A", () => {
    expect(keys(new Decoder(), "\x1b[A")).toEqual([{ mods: "", name: "up" }])
  })

  test("arrows, one of each direction", () => {
    expect(keys(new Decoder(), "\x1b[A\x1b[B\x1b[C\x1b[D")).toEqual([
      { mods: "", name: "up" },
      { mods: "", name: "down" },
      { mods: "", name: "right" },
      { mods: "", name: "left" },
    ])
  })

  test("ctrl+up via ESC [ 1 ; 5 A", () => {
    expect(keys(new Decoder(), "\x1b[1;5A")).toEqual([{ mods: "c", name: "up" }])
  })

  test("shift+alt+right via ESC [ 1 ; 4 C", () => {
    expect(keys(new Decoder(), "\x1b[1;4C")).toEqual([{ mods: "as", name: "right" }])
  })

  test("delete via ESC [ 3 ~", () => {
    expect(keys(new Decoder(), "\x1b[3~")).toEqual([{ mods: "", name: "delete" }])
  })

  test("pageup via ESC [ 5 ~", () => {
    expect(keys(new Decoder(), "\x1b[5~")).toEqual([{ mods: "", name: "pageup" }])
  })

  test("F5 via ESC [ 15 ~", () => {
    expect(keys(new Decoder(), "\x1b[15~")).toEqual([{ mods: "", name: "f5" }])
  })

  test("shift+enter via CSI-u", () => {
    expect(keys(new Decoder(), "\x1b[13;2u")).toEqual([{ mods: "s", name: "enter" }])
  })

  test("ctrl+c via CSI-u", () => {
    expect(keys(new Decoder(), "\x1b[99;5u")).toEqual([{ mods: "c", name: "c" }])
  })

  test("xterm modifyOtherKeys encodes shift+enter", () => {
    expect(keys(new Decoder(), "\x1b[27;2;13~")).toEqual([{ mods: "s", name: "enter" }])
  })

  test("Kitty arrows preserve event type", () => {
    expect(new Decoder().feed("\x1b[1;1:3C")).toEqual([
      {
        event: {
          alt: false,
          ctrl: false,
          eventType: "release",
          meta: false,
          name: "right",
          shift: false,
        },
        type: "key",
      },
    ])
  })

  test("Kitty CSI-u preserves alternate keys and event type", () => {
    expect(new Decoder().feed("\x1b[99:67:99;6:2u")).toEqual([
      {
        event: {
          alt: false,
          base: "c",
          ctrl: true,
          eventType: "repeat",
          meta: false,
          name: "c",
          shift: true,
        },
        type: "key",
      },
    ])
  })

  test("named Kitty functional key (numpad enter)", () => {
    // 57414 = KP_ENTER — mapped in CSI_U_NAMES.
    expect(keys(new Decoder(), "\x1b[57414u")).toEqual([{ mods: "", name: "enter" }])
  })

  test("drops unmodeled Kitty functional keys instead of emitting PUA glyphs", () => {
    // 57404 (KP_5) sits in the private-use area with no name mapping; it must
    // not surface as a printable char with garbage text.
    expect(new Decoder().feed("\x1b[57404u")).toEqual([])
  })
})

describe("Decoder — SS3 function keys", () => {
  test("F1 via ESC O P", () => {
    expect(keys(new Decoder(), "\x1bOP")).toEqual([{ mods: "", name: "f1" }])
  })

  test("F4 via ESC O S", () => {
    expect(keys(new Decoder(), "\x1bOS")).toEqual([{ mods: "", name: "f4" }])
  })
})

describe("Decoder — ESC handling", () => {
  test("bare ESC is pending until flush", () => {
    const d = new Decoder()
    expect(d.feed("\x1b")).toEqual([])
    const out = d.flush()
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ event: { name: "esc" }, type: "key" })
  })

  test("ESC followed by char = alt+char", () => {
    expect(keys(new Decoder(), "\x1ba")).toEqual([{ mods: "a", name: "a" }])
  })

  test("stream split mid-CSI — holds state across feed() calls", () => {
    const d = new Decoder()
    expect(d.feed("\x1b")).toEqual([])
    expect(d.feed("[")).toEqual([])
    const out = d.feed("A")
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ event: { name: "up" }, type: "key" })
  })
})

describe("Decoder — mouse", () => {
  test("decodes SGR scroll wheel events", () => {
    expect(new Decoder().feed("\x1b[<64;10;5M")).toEqual([
      {
        alt: false,
        ctrl: false,
        deltaY: -1,
        kind: "scroll",
        meta: false,
        shift: false,
        type: "mouse",
        x: 10,
        y: 5,
      },
    ])
    expect(new Decoder().feed("\x1b[<65;10;5M")).toMatchObject([{ deltaY: 1, kind: "scroll" }])
  })

  test("decodes SGR left button down, drag, and up events", () => {
    const out = new Decoder().feed("\x1b[<0;10;5M\x1b[<32;12;7M\x1b[<0;12;7m")
    expect(out).toEqual([
      {
        alt: false,
        button: "left",
        ctrl: false,
        kind: "down",
        meta: false,
        shift: false,
        type: "mouse",
        x: 10,
        y: 5,
      },
      {
        alt: false,
        button: "left",
        ctrl: false,
        kind: "drag",
        meta: false,
        shift: false,
        type: "mouse",
        x: 12,
        y: 7,
      },
      {
        alt: false,
        button: "left",
        ctrl: false,
        kind: "up",
        meta: false,
        shift: false,
        type: "mouse",
        x: 12,
        y: 7,
      },
    ])
  })

  test("preserves mouse modifier bits", () => {
    expect(new Decoder().feed("\x1b[<28;3;4M")).toEqual([
      {
        alt: true,
        button: "left",
        ctrl: true,
        kind: "down",
        meta: false,
        shift: true,
        type: "mouse",
        x: 3,
        y: 4,
      },
    ])
  })
})

describe("Decoder — terminal responses", () => {
  test("decodes DA CSI responses", () => {
    expect(new Decoder().feed("\x1b[?1;2c\x1b[>1;4000;0c")).toEqual([
      { final: "c", kind: "csi", params: "?1;2", sequence: "\x1b[?1;2c", type: "term-response" },
      {
        final: "c",
        kind: "csi",
        params: ">1;4000;0",
        sequence: "\x1b[>1;4000;0c",
        type: "term-response",
      },
    ])
  })

  test("holds a split Kitty keyboard protocol response", () => {
    const d = new Decoder()
    expect(d.feed("\x1b[?7")).toEqual([])
    expect(d.feed("u")).toEqual([
      { final: "u", kind: "csi", params: "?7", sequence: "\x1b[?7u", type: "term-response" },
    ])
  })

  test("decodes OSC responses terminated by BEL or ST", () => {
    expect(
      new Decoder().feed("\x1b]4;1;rgb:ffff/0000/0000\x07\x1b]10;rgb:1111/2222/3333\x1b\\")
    ).toEqual([
      {
        kind: "osc",
        payload: "4;1;rgb:ffff/0000/0000",
        sequence: "\x1b]4;1;rgb:ffff/0000/0000\x07",
        type: "term-response",
      },
      {
        kind: "osc",
        payload: "10;rgb:1111/2222/3333",
        sequence: "\x1b]10;rgb:1111/2222/3333\x1b\\",
        type: "term-response",
      },
    ])
  })

  test("decodes DCS and APC responses", () => {
    expect(new Decoder().feed("\x1bP>|Ghostty 1.2\x1b\\\x1b_Gi=1;OK\x1b\\")).toEqual([
      {
        kind: "dcs",
        payload: ">|Ghostty 1.2",
        sequence: "\x1bP>|Ghostty 1.2\x1b\\",
        type: "term-response",
      },
      {
        kind: "apc",
        payload: "Gi=1;OK",
        sequence: "\x1b_Gi=1;OK\x1b\\",
        type: "term-response",
      },
    ])
  })

  test("holds split APC responses until the terminator arrives", () => {
    const d = new Decoder()
    expect(d.feed("\x1b_Gi=1")).toEqual([])
    expect(d.feed(";OK\x1b\\")).toEqual([
      {
        kind: "apc",
        payload: "Gi=1;OK",
        sequence: "\x1b_Gi=1;OK\x1b\\",
        type: "term-response",
      },
    ])
  })
})

describe("Decoder — paste + focus", () => {
  test("bracketed paste emits a single PasteEvent", () => {
    const d = new Decoder()
    const out = d.feed("\x1b[200~hello world\x1b[201~")
    expect(out).toHaveLength(1)
    expect(out[0]).toEqual({ text: "hello world", type: "paste" })
  })

  test("keystrokes during paste are included literally (including newlines)", () => {
    const d = new Decoder()
    const out = d.feed("\x1b[200~line1\nline2\x1b[201~")
    expect(out).toHaveLength(1)
    expect(out[0]).toEqual({ text: "line1\nline2", type: "paste" })
  })

  test("focus in / focus out", () => {
    const d = new Decoder()
    expect(d.feed("\x1b[I")).toEqual([{ gained: true, type: "focus" }])
    expect(d.feed("\x1b[O")).toEqual([{ gained: false, type: "focus" }])
  })
})
