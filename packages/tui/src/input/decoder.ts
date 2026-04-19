import type { KeyEvent } from "./keys.ts"

/**
 * Decoder — bytes (as a string, after the caller UTF-8 decodes them) in,
 * structured `InputEvent`s out. Holds partial state across `feed()` calls
 * so split-chunk CSI / SS3 / paste sequences work transparently.
 *
 * ESC handling: a lone ESC byte is held as pending (because `ESC + <byte>`
 * might be Alt+<key> or the start of a CSI sequence). Call `flush()` from
 * an idle-timer tick to emit a bare `esc` event when no follow-up arrives.
 */

export type InputEvent =
  | { type: "key"; event: KeyEvent }
  | { type: "paste"; text: string }
  | { type: "focus"; gained: boolean }

export class Decoder {
  #pending = ""
  // Non-undefined while we're accumulating the body of a bracketed-paste
  // block. Any bytes that arrive — including newlines and control chars —
  // go into this buffer verbatim until we see `\x1b[201~`.
  #paste: string | undefined

  feed(chunk: string): InputEvent[] {
    const out: InputEvent[] = []
    let buf = this.#pending + chunk
    this.#pending = ""

    while (buf.length > 0) {
      if (this.#paste !== undefined) {
        const end = buf.indexOf(PASTE_END)
        if (end === -1) {
          this.#paste += buf
          buf = ""
          continue
        }
        this.#paste += buf.slice(0, end)
        out.push({ text: this.#paste, type: "paste" })
        this.#paste = undefined
        buf = buf.slice(end + PASTE_END.length)
        continue
      }

      const c = buf[0]
      if (c === "\x1b") {
        const consumed = parseEsc(buf, out, () => {
          this.#paste = ""
        })
        if (consumed === 0) {
          // Incomplete — hold and await more bytes.
          this.#pending = buf
          return out
        }
        buf = buf.slice(consumed)
        continue
      }

      const step = decodeChar(buf, out, { alt: false })
      buf = buf.slice(step)
    }

    return out
  }

  /**
   * Force-emit any state we've been holding. Currently only the bare-ESC
   * case: if `feed` ended on a lone `\x1b` we hold it in case `a` follows
   * (alt+a); call `flush` after a short idle timeout to commit it as an
   * `esc` key press.
   */
  flush(): InputEvent[] {
    if (this.#pending === "\x1b") {
      this.#pending = ""
      return [key({ name: "esc" })]
    }
    return []
  }
}

const PASTE_END = "\x1b[201~"

// -----------------------------------------------------------------------------
// ESC-prefixed parsing.
// -----------------------------------------------------------------------------

function parseEsc(buf: string, out: InputEvent[], onPasteStart: () => void): number {
  if (buf.length === 1) return 0 // just ESC, need more

  const second = buf[1]
  if (second === "[") return parseCsi(buf, out, onPasteStart)
  if (second === "O") return parseSs3(buf, out)

  // Anything else after ESC is alt + <that key>.
  return 1 + decodeChar(buf.slice(1), out, { alt: true })
}

function parseCsi(buf: string, out: InputEvent[], onPasteStart: () => void): number {
  // buf[0..1] = "\x1b[". Final byte is 0x40..0x7e. Params are the bytes in
  // between — digits plus `;` (and sometimes `?` / `>`). We're permissive:
  // scan for the final byte, slice params, dispatch.
  let i = 2
  while (i < buf.length) {
    const code = buf.charCodeAt(i)
    if (code >= 0x40 && code <= 0x7e) {
      const params = buf.slice(2, i)
      const final = buf[i]
      const consumed = i + 1
      if (params === "200" && final === "~") {
        onPasteStart()
        return consumed
      }
      if (params === "" && final === "I") {
        out.push({ gained: true, type: "focus" })
        return consumed
      }
      if (params === "" && final === "O") {
        out.push({ gained: false, type: "focus" })
        return consumed
      }
      handleCsi(params, final, out)
      return consumed
    }
    i++
  }
  return 0 // incomplete
}

function parseSs3(buf: string, out: InputEvent[]): number {
  if (buf.length < 3) return 0
  const final = buf[2]
  const name = SS3_NAMES[final]
  if (name !== undefined) out.push(key({ name }))
  return 3
}

const ARROW_NAMES: Partial<Record<string, string>> = {
  A: "up",
  B: "down",
  C: "right",
  D: "left",
  F: "end",
  H: "home",
}

const TILDE_NAMES: Partial<Record<string, string>> = {
  "1": "home",
  "11": "f1",
  "12": "f2",
  "13": "f3",
  "14": "f4",
  "15": "f5",
  "17": "f6",
  "18": "f7",
  "19": "f8",
  "2": "insert",
  "20": "f9",
  "21": "f10",
  "23": "f11",
  "24": "f12",
  "3": "delete",
  "4": "end",
  "5": "pageup",
  "6": "pagedown",
  "7": "home",
  "8": "end",
}

const SS3_NAMES: Partial<Record<string, string>> = { P: "f1", Q: "f2", R: "f3", S: "f4" }

function handleCsi(params: string, final: string, out: InputEvent[]): void {
  const parts = params.length === 0 ? [] : params.split(";")

  const arrow = ARROW_NAMES[final]
  if (arrow !== undefined) {
    // Form is either `A` (no params) or `1;<mod>A` (modified).
    const mod = parts.length === 2 ? Number.parseInt(parts[1], 10) : 1
    out.push(key({ name: arrow, ...modBits(mod) }))
    return
  }

  if (final === "~") {
    const code = parts[0] ?? ""
    const name = TILDE_NAMES[code]
    if (name === undefined) return
    const mod = parts.length === 2 ? Number.parseInt(parts[1], 10) : 1
    out.push(key({ name, ...modBits(mod) }))
    return
  }

  // Unrecognized CSI — drop. (Mouse reports, cursor-position responses,
  // etc. will land here until phase 2 handles them.)
}

function modBits(m: number): Pick<KeyEvent, "alt" | "ctrl" | "meta" | "shift"> {
  // CSI modifier param: 1 = none, then 1 + bit-set over (shift|alt|ctrl|meta).
  const v = Number.isFinite(m) ? m - 1 : 0
  return {
    alt: (v & 0b0010) !== 0,
    ctrl: (v & 0b0100) !== 0,
    meta: (v & 0b1000) !== 0,
    shift: (v & 0b0001) !== 0,
  }
}

// -----------------------------------------------------------------------------
// Character-level decoding (used both for plain bytes and for the byte after ESC).
// -----------------------------------------------------------------------------

function decodeChar(buf: string, out: InputEvent[], opts: { alt: boolean }): number {
  const alt = opts.alt
  const code = buf.charCodeAt(0)

  if (code === 0x09) {
    out.push(key({ alt, name: "tab" }))
    return 1
  }
  if (code === 0x0a || code === 0x0d) {
    out.push(key({ alt, name: "enter" }))
    return 1
  }
  if (code === 0x08 || code === 0x7f) {
    out.push(key({ alt, name: "backspace" }))
    return 1
  }
  if (code === 0x20) {
    out.push(key({ alt, name: "space", text: " " }))
    return 1
  }
  if (code >= 0x01 && code <= 0x1a) {
    // Ctrl + letter. Except 0x09 / 0x0a / 0x0d which we already mapped above
    // to their dedicated names (tab / enter), so the user's handler can
    // keyMatches("tab") without also writing keyMatches("ctrl-i").
    const letter = String.fromCharCode(code + 0x60)
    out.push(key({ alt, ctrl: true, name: letter }))
    return 1
  }

  // Printable: take a full code point (handles surrogate pairs). On stdin
  // in raw mode with utf8 encoding, Node gives us already-decoded strings
  // so surrogate pairs only appear for astral planes — still handle them.
  const cp = buf.codePointAt(0) ?? 0
  const ch = String.fromCodePoint(cp)
  const isUpper = ch.length === 1 && ch >= "A" && ch <= "Z"
  out.push(key({ alt, name: ch, shift: isUpper, text: ch }))
  return ch.length
}

function key(partial: Partial<KeyEvent> & { name: string }): InputEvent {
  return {
    event: {
      alt: partial.alt ?? false,
      ctrl: partial.ctrl ?? false,
      meta: partial.meta ?? false,
      name: partial.name,
      shift: partial.shift ?? false,
      ...(partial.text !== undefined ? { text: partial.text } : {}),
    },
    type: "key",
  }
}
