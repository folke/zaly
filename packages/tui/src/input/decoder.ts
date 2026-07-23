import type { KeyEvent, KeyEventType } from "./keys.ts"

/**
 * Decoder — bytes (as a string, after the caller UTF-8 decodes them) in,
 * structured `InputEvent`s out. Holds partial state across `feed()` calls
 * so split-chunk CSI / SS3 / paste sequences work transparently.
 *
 * ESC handling: a lone ESC byte is held as pending (because `ESC + <byte>`
 * might be Alt+<key> or the start of a CSI sequence). Call `flush()` from
 * an idle-timer tick to emit a bare `esc` event when no follow-up arrives.
 */

export type MouseButton = "left" | "middle" | "right"

export type MouseEvent = {
  type: "mouse"
  x: number
  y: number
  alt: boolean
  ctrl: boolean
  meta: boolean
  shift: boolean
} & (
  | { kind: "scroll"; deltaY: number }
  | { kind: "down" | "drag" | "up"; button: MouseButton; click?: 1 | 2 | 3 }
)

export type TerminalResponseEvent =
  | { type: "term-response"; kind: "csi"; sequence: string; params: string; final: string }
  | { type: "term-response"; kind: "osc" | "dcs" | "apc"; sequence: string; payload: string }

export type InputEvent =
  | { type: "key"; event: KeyEvent }
  | { type: "paste"; text: string }
  | { type: "focus"; gained: boolean }
  | TerminalResponseEvent
  | MouseEvent

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
  if (second === "]") return parseStringControl(buf, out, "osc")
  if (second === "P") return parseStringControl(buf, out, "dcs")
  if (second === "_") return parseStringControl(buf, out, "apc")

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
      if (isTerminalCsiResponse(params, final)) {
        out.push({
          final,
          kind: "csi",
          params,
          sequence: buf.slice(0, consumed),
          type: "term-response",
        })
        return consumed
      }
      handleCsi(params, final, out)
      return consumed
    }
    i++
  }
  return 0 // incomplete
}

function parseStringControl(buf: string, out: InputEvent[], kind: "osc" | "dcs" | "apc"): number {
  const payloadStart = 2
  const st = buf.indexOf("\x1b\\", payloadStart)
  const bel = kind === "osc" ? buf.indexOf("\x07", payloadStart) : -1
  const useBel = bel !== -1 && (st === -1 || bel < st)
  const end = useBel ? bel : st
  if (end === -1) return 0
  const consumed = end + (useBel ? 1 : 2)
  out.push({
    kind,
    payload: buf.slice(payloadStart, end),
    sequence: buf.slice(0, consumed),
    type: "term-response",
  })
  return consumed
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

/** A CSI primary/secondary Device Attributes reply (`CSI ? … c` / `CSI > … c`). */
export function isDeviceAttributesResponse(params: string, final: string): boolean {
  return final === "c" && /^[?>]\d+(?:;\d+)*$/.test(params)
}

/** A Kitty keyboard-protocol flags reply (`CSI ? <flags> u`). */
export function isKittyFlagsResponse(params: string, final: string): boolean {
  return final === "u" && /^\?\d+$/.test(params)
}

function isTerminalCsiResponse(params: string, final: string): boolean {
  return isDeviceAttributesResponse(params, final) || isKittyFlagsResponse(params, final)
}

function handleCsi(params: string, final: string, out: InputEvent[]): void {
  if ((final === "M" || final === "m") && params.startsWith("<")) {
    handleMouse(params, final, out)
    return
  }

  const parts = params.length === 0 ? [] : params.split(";")

  const arrow = ARROW_NAMES[final]
  if (arrow !== undefined) {
    // Form is either `A` (no params) or `1;<mod>:<event>A`.
    const { eventType, mod } = csiModifiers(parts[1])
    out.push(key({ name: arrow, ...modBits(mod), ...(eventType ? { eventType } : {}) }))
    return
  }

  if (final === "~") {
    if (parts[0] === "27" && parts.length === 3) {
      pushCsiKey(Number.parseInt(parts[2] ?? "", 10), Number.parseInt(parts[1] ?? "", 10), out)
      return
    }

    const code = parts[0] ?? ""
    const name = TILDE_NAMES[code]
    if (name === undefined) return
    const { eventType, mod } = csiModifiers(parts[1])
    out.push(key({ name, ...modBits(mod), ...(eventType ? { eventType } : {}) }))
    return
  }

  if (final === "u") {
    handleCsiU(params, out)
    return
  }

  // Unrecognized CSI — drop. (Cursor-position responses, etc.)
}

function csiModifiers(part: string | undefined): { eventType?: KeyEventType; mod: number } {
  if (part === undefined) return { mod: 1 }
  const [rawMod, rawEventType] = part.split(":", 2)
  const mod = Number.parseInt(rawMod, 10)
  const eventType = eventTypeFromDigit(rawEventType)
  return eventType ? { eventType, mod } : { mod }
}

/** Kitty event-type sub-parameter: 1 = press (the default, usually omitted),
 *  2 = repeat, 3 = release. */
function eventTypeFromDigit(digit: string | undefined): KeyEventType | undefined {
  if (digit === "1") return "press"
  if (digit === "2") return "repeat"
  if (digit === "3") return "release"
  return undefined
}

function handleCsiU(params: string, out: InputEvent[]): void {
  const match = params.match(/^(\d+)(?::(\d*))?(?::(\d+))?(?:;(\d+))?(?::([123]))?$/)
  if (!match) return

  const code = Number.parseInt(match[1], 10)
  const mod = match[4] ? Number.parseInt(match[4], 10) : 1
  const shifted = match[2] ? Number.parseInt(match[2], 10) : undefined
  const base = match[3] ? Number.parseInt(match[3], 10) : undefined
  pushCsiKey(code, mod, out, { base, eventType: eventTypeFromDigit(match[5]), shifted })
}

function pushCsiKey(
  code: number,
  mod: number,
  out: InputEvent[],
  opts: { base?: number; eventType?: KeyEventType; shifted?: number } = {}
): void {
  const name = CSI_U_NAMES[code] ?? nameFromCodePoint(code)
  if (name === undefined) return

  const mods = modBits(mod)
  const event: Partial<KeyEvent> & { name: string } = { name, ...mods }
  const base = opts.base !== undefined ? codePointToString(opts.base) : undefined
  if (base !== undefined) event.base = base
  if (opts.eventType !== undefined) event.eventType = opts.eventType
  if (opts.eventType !== "release" && !mods.alt && !mods.ctrl && !mods.meta && name.length === 1) {
    const shifted = opts.shifted !== undefined ? codePointToString(opts.shifted) : undefined
    event.text = shifted ?? name
  }
  out.push(key(event))
}

// Unicode private-use area (U+E000..U+F8FF). The Kitty keyboard protocol
// encodes functional keys (keypad, media, extra modifiers) as code points in
// this block; the ones we model live in CSI_U_NAMES. Any other PUA code is a
// key we don't name — it must be dropped, never rendered as a printable char.
const PUA_START = 57_344
const PUA_END = 63_743

/** Convert a Unicode code point to a string, or `undefined` if it isn't a
 *  usable printable scalar value (control char, surrogate, or out of range). */
function codePointToString(cp: number): string | undefined {
  if (!Number.isSafeInteger(cp) || cp < 32 || cp > 1_114_111) return undefined
  if (cp >= 55_296 && cp <= 57_343) return undefined // lone surrogate (U+D800..U+DFFF)
  return String.fromCodePoint(cp)
}

/** Like {@link codePointToString}, but also drops unnamed Kitty functional
 *  keys so they never surface as private-use-area glyphs. */
function nameFromCodePoint(code: number): string | undefined {
  if (code >= PUA_START && code <= PUA_END) return undefined
  return codePointToString(code)
}

const CSI_U_NAMES: Partial<Record<number, string>> = {
  127: "backspace",
  13: "enter",
  27: "esc",
  57_414: "enter",
  57_417: "left",
  57_418: "right",
  57_419: "up",
  57_420: "down",
  57_421: "pageup",
  57_422: "pagedown",
  57_423: "home",
  57_424: "end",
  57_425: "insert",
  57_426: "delete",
  9: "tab",
}

function handleMouse(params: string, final: string, out: InputEvent[]): void {
  const parts = params
    .slice(1)
    .split(";")
    .map((p) => Number.parseInt(p, 10))
  const [button, x, y] = parts
  if (!Number.isFinite(button) || !Number.isFinite(x) || !Number.isFinite(y)) return

  const code = button & 0b11
  const scroll = (button & 0b0100_0000) !== 0
  const mods = mouseModBits(button)
  if (scroll) {
    out.push({
      ...mods,
      deltaY: code === 0 ? -1 : 1,
      kind: "scroll",
      type: "mouse",
      x,
      y,
    })
    return
  }

  const mouseButton = buttonName(code)
  if (!mouseButton) return
  const kind = mouseKind(button, final)
  out.push({
    ...mods,
    button: mouseButton,
    kind,
    type: "mouse",
    x,
    y,
  })
}

function mouseKind(button: number, final: string): "down" | "drag" | "up" {
  if (final === "m") return "up"
  if ((button & 0b0010_0000) !== 0) return "drag"
  return "down"
}

function buttonName(code: number): MouseButton | undefined {
  if (code === 0) return "left"
  if (code === 1) return "middle"
  if (code === 2) return "right"
  return undefined
}

function mouseModBits(button: number): Pick<KeyEvent, "alt" | "ctrl" | "meta" | "shift"> {
  return {
    alt: (button & 0b1000) !== 0,
    ctrl: (button & 0b1_0000) !== 0,
    meta: false,
    shift: (button & 0b0100) !== 0,
  }
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
      ...(partial.base !== undefined ? { base: partial.base } : {}),
      ...(partial.eventType !== undefined ? { eventType: partial.eventType } : {}),
      ...(partial.text !== undefined ? { text: partial.text } : {}),
    },
    type: "key",
  }
}
