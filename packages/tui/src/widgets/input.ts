import type { MaybePromise } from "@zaly/shared"
import type { DetectedFile } from "@zaly/shared/detect"
import type { RenderCtx } from "../core/ctx.ts"
import type { BaseEvents } from "../core/node.ts"
import type { Reactive } from "../core/reactive.ts"
import type { StyleState } from "../core/state.ts"
import type { NodeActionMap } from "../input/actions.ts"
import type { RoutedKey } from "../input/router.ts"
import type { Size } from "../layout/size.ts"
import type { StyleBuilder } from "../style/builder.ts"

import { hash, isPromiseLike } from "@zaly/shared"
import { sliceAnsi, splitAnsi, stringWidth } from "@zaly/shared/ansi"
import { fileDetect } from "@zaly/shared/detect"
import { basename } from "pathe"
import { Node } from "../core/node.ts"
import { untrack, unwrap } from "../core/reactive.ts"
import { clipboard } from "../input/clipboard.ts"
import { formatText } from "../layout/text.ts"

export interface InputState extends StyleState {
  /** Current text content. May include `\n` for multi-line input. */
  value?: string
  /** Shown dim when `value` is empty. */
  placeholder?: Reactive<string | undefined>
  /** Cursor position as a char index in `value`. Clamped to `[0, value.length]`. */
  cursor?: number
  /** Render width. Defaults to `fill`. */
  width?: Size
  /** Submitted input history, newest last. */
  history?: readonly string[]
  /** Threshold for showing pasted content as an attachment rather than raw text */
  pasteMaxLines?: number
  pasteMaxChars?: number
  canAttach?: (file: InputAttachment) => boolean
  format?: (value: string, ctx: { style: StyleBuilder }) => MaybePromise<string>
  validate?: (value: string) => boolean
}

export type InputValue = { value: string; attachments: InputAttachment[] }

const PASTE_MAX_LINES = 5
const PASTE_MAX_CHARS = 1000

/** A clipboard or bracketed paste that exceeds the `pasteMax*` thresholds. **/
type Paste = { type: "paste"; text: string }

/** A file or image attachment detected from the clipboard. */
export type InputAttachment = DetectedFile & { path: string }

export type InputEvents = BaseEvents & {
  /** Fired when the submitted history changes. */
  history: { history: string[]; added: string }
  /** Fired when plain Enter is pressed. Payload is the current value. */
  submit: { value: string; attachments: InputAttachment[] }
  /** Fired when the user pastes a non-text resource via the
   *  `input.paste` action. Images and file references both land here,
   *  discriminated by `attachment.kind`. One event fires per image
   *  paste; one per file in a multi-file paste.
   *
   *  Wrapped under `attachment` because `InputAttachment` carries its
   *  own `type` field (MIME) that would shadow the envelope's `type`
   *  discriminator if spread directly. */
  attach: { attachment: InputAttachment }
}

type FormatEntry = { promise?: Promise<void>; result?: string; input: string }

/**
 * Multi-line text input with auto-grow.
 *
 * Editing commands (`cursorLeft`, `deleteWordBack`, `submit`, …) live on
 * `this.actions` as zero-arg methods. The input router maps keymap
 * bindings like `"input.cursorLeft"` onto those methods — users bind
 * different keys by configuring the keymap, not by patching the class.
 * The methods are also callable directly (`input.actions.submit()`),
 * which is handy in tests or for higher-level macros.
 *
 * What this class *still* handles via its `key` event listener:
 *   - **Printable character insertion.** An unbound keystroke whose
 *     `text` is set and has no ctrl/alt/meta modifier becomes a literal
 *     insert at the cursor. There's no action for every printable char
 *     in the keymap; the raw-key fallback handles them.
 *   - **Paste events.** Whole payload inserted at cursor; always.
 *
 * Everything else (navigation, editing, submit/newline) goes through
 * the router → actions pipeline. Unbound non-printable keys fall back
 * to `emit("key", …)` and bubble to the parent chain.
 *
 * Rendering word-wraps each logical line to `ctx.width`, so long
 * messages naturally grow vertically. The UI surface resizes its
 * reserved footer when the Input's row count changes, so the stream
 * above shifts accordingly.
 */
export class Input extends Node<InputState, InputEvents> {
  /** Class-level scope tag used by the input router to bind keymaps. */
  static readonly type = "input"

  override readonly type = Input.type
  #focused = false
  #history: string[] = []
  #historyDraft = ""
  #historyIndex: number | undefined
  #preferredCol: number | undefined
  #staged: ((InputAttachment | Paste) & { id: number; marker: string })[] = []
  #formatCache: Map<string, FormatEntry> & { version?: number } = new Map<string, FormatEntry>()
  #formatGen = 0

  /**
   * Editing actions. Parameterless — they close over `this` — so both
   * the router (via keymap dispatch) and application code can invoke
   * them. Add to the keymap in `src/input/actions.ts` to give them
   * default key bindings.
   */
  override actions = {
    "input.cursorDown": (): void => {
      const v = this.state.value ?? ""
      const { col, line } = posToLineCol(v, this.#cursor())
      if (line >= countLines(v) - 1) {
        this.#historyNext()
        return
      }
      this.#preferredCol ??= col
      this.state.cursor = lineColToPos(v, line + 1, this.#preferredCol)
    },
    "input.cursorLeft": (): void => {
      const c = this.#cursor()
      this.#preferredCol = undefined
      this.state.cursor = c > 0 ? c - 1 : c
    },
    "input.cursorLineEnd": (): void => {
      const v = this.state.value ?? ""
      this.#preferredCol = undefined
      this.state.cursor = lineEndPos(v, this.#cursor())
    },
    "input.cursorLineStart": (): void => {
      const v = this.state.value ?? ""
      const { line } = posToLineCol(v, this.#cursor())
      this.#preferredCol = undefined
      this.state.cursor = lineColToPos(v, line, 0)
    },
    "input.cursorRight": (): void => {
      const v = this.state.value ?? ""
      const c = this.#cursor()
      this.#preferredCol = undefined
      this.state.cursor = c < v.length ? c + 1 : c
    },
    "input.cursorUp": (): void => {
      const v = this.state.value ?? ""
      const { col, line } = posToLineCol(v, this.#cursor())
      if (line === 0) {
        this.#historyPrev()
        return
      }
      this.#preferredCol ??= col
      this.state.cursor = lineColToPos(v, line - 1, this.#preferredCol)
    },
    "input.deleteCharBack": (): void => {
      const v = this.state.value ?? ""
      const c = this.#cursor()
      this.#preferredCol = undefined
      if (c === 0) return
      this.#historyEdit()
      const marker = this.#markerRange(c, "back")
      if (marker) return this.#deleteRange(marker.start, marker.end)
      this.state.set({ cursor: c - 1, value: v.slice(0, c - 1) + v.slice(c) })
    },
    "input.deleteCharForward": (): void => {
      const v = this.state.value ?? ""
      const c = this.#cursor()
      this.#preferredCol = undefined
      if (c >= v.length) return
      this.#historyEdit()
      const marker = this.#markerRange(c, "forward")
      if (marker) return this.#deleteRange(marker.start, marker.end)
      this.state.value = v.slice(0, c) + v.slice(c + 1)
    },
    "input.deleteWordBack": (): void => {
      const v = this.state.value ?? ""
      const c = this.#cursor()
      this.#preferredCol = undefined
      let i = c
      while (i > 0 && isWhitespace(v[i - 1])) i--
      while (i > 0 && !isWhitespace(v[i - 1])) i--
      if (i === c) return
      this.#historyEdit()
      this.state.set({ cursor: i, value: v.slice(0, i) + v.slice(c) })
    },
    "input.insertNewline": (): void => {
      // Smart indent: copy the leading whitespace of the current
      // logical line onto the new line so continuations stay aligned
      // with the bullet / quote / prefix the user typed.
      const v = this.state.value ?? ""
      const c = this.#cursor()
      this.#preferredCol = undefined
      let lineStart = c
      while (lineStart > 0 && v[lineStart - 1] !== "\n") lineStart--
      let indent = ""
      for (let i = lineStart; i < c; i++) {
        const ch = v[i]
        if (ch === " " || ch === "\t") indent += ch
        else break
      }
      const insert = `\n${indent}`
      this.#historyEdit()
      this.state.set({
        cursor: c + insert.length,
        value: v.slice(0, c) + insert + v.slice(c),
      })
    },
    "input.insertTab": (): void => {
      // Two spaces rather than `\t` — terminal tab stops are
      // unpredictable (often 8 cells) and play badly with our per-row
      // layout. Soft tabs are the safer default; users wanting real
      // tabs can override the action.
      const v = this.state.value ?? ""
      const c = this.#cursor()
      this.#preferredCol = undefined
      const tab = "  "
      this.#historyEdit()
      this.state.set({ cursor: c + tab.length, value: v.slice(0, c) + tab + v.slice(c) })
    },
    // `ctrl-v` queries the OS clipboard (via xclip / wl-paste / pbpaste /
    // PowerShell depending on platform). The richest content wins:
    //
    //   - **image bytes** → one `attach` event with a temp PNG path.
    //   - **file references** → one `attach` event per file.
    //   - **plain text** → inserted at the cursor like a regular paste.
    //
    // Fire-and-forget async — we await the probe and commit the
    // result in a microtask.
    "input.paste": (): void => {
      void (async (): Promise<void> => {
        const content = await clipboard.read()
        if (!content) return

        // Route through the regular paste handler
        if (content.kind === "text") {
          void this.emit("paste", {
            paste: {
              stop: () => void 0,
              stopped: false,
              text: content.text,
            },
          })
          return
        }

        const paths: string[] = content.kind === "image" ? [content.path] : content.paths
        const files = await Promise.all(paths.map((path) => fileDetect({ path })))
        for (let i = 0; i < paths.length; i++) {
          const path = paths[i]
          const file = files[i]
          if (!file) continue
          this.attach({ ...file, path })
        }
      })()
    },
    "input.submit": (): void => {
      const value = this.state.value ?? ""
      if (this.state.validate?.(value) === false) return
      const ret = this.consume()
      this.#historyAdd(ret.value)
      void this.emit("submit", ret)
    },
  } satisfies NodeActionMap

  constructor(initial: InputState = {}) {
    const value = initial.value ?? ""
    super({ cursor: value.length, value, ...initial })
    this.#history = [...(initial.history ?? [])]
    this.on("key", ({ key }) => {
      this.#handleKey(key)
    })
    this.on("paste", ({ paste }) => {
      this.paste(paste.text)
      paste.stop()
    })
    this.on("focus", () => {
      this.#focused = true
      this.invalidate()
    })
    this.on("blur", () => {
      this.#focused = false
      this.invalidate()
    })

    this.on("mount", () => {
      this.ctx?.input.events.on("terminal-focus", () => this.invalidate(), {
        signal: this.mountSignal,
      })
    })
  }

  get history(): readonly string[] {
    return this.#history
  }

  set history(v: readonly string[]) {
    this.#history = [...v]
    this.#historyIndex = undefined
  }

  attach(att: InputAttachment | Paste): void {
    if (att.type !== "paste" && this.state.canAttach?.(att) === false) {
      // Caller doesn't want this attachment (e.g. model doesn't support it) — fall
      // back to pasting the path as plain text
      return this.insert(att.path)
    }

    const id = this.#staged.length + 1
    let prefix = att.type[0].toUpperCase() + att.type.slice(1)
    let suffix = ""
    if (att.type === "paste") {
      prefix = "Pasted text"
      suffix = ` +${countLines(att.text)} lines`
    } else if (!["image", "pdf"].includes(att.type)) suffix = ` ${basename(att.path)}`
    const marker = `[${prefix} #${id}${suffix}]`
    this.#staged.push({ ...att, id, marker })
    this.insert(marker)

    if (att.type !== "paste") void this.emit("attach", { attachment: att })
  }

  paste(text: string): void {
    if (
      countLines(text) > (this.state.pasteMaxLines ?? PASTE_MAX_LINES) ||
      stringWidth(text) > (this.state.pasteMaxChars ?? PASTE_MAX_CHARS)
    )
      return this.attach({ text, type: "paste" })
    this.insert(text)
  }

  insert(text: string): void {
    const v = this.state.value ?? ""
    const c = this.#cursor()
    this.#historyEdit()
    this.#preferredCol = undefined
    this.state.set({
      cursor: c + text.length,
      value: v.slice(0, c) + text + v.slice(c),
    })
  }

  replace(text: string): void {
    this.state.value = ""
    this.insert(text)
  }

  /** Consume the input's current value and attachments.
   * Pastes are replaced inline with their text; file/image
   * attachments are returned in the `attachments` array and removed from the value. */
  consume(): InputValue {
    let value = this.state.value ?? ""
    const atts: InputAttachment[] = []
    for (const att of this.#staged) {
      if (!value.includes(att.marker)) continue
      if (att.type === "paste") {
        value = value.replace(att.marker, att.text)
      } else atts.push(att)
    }
    this.#staged = []
    this.#preferredCol = undefined
    this.state.set({ cursor: 0, value: "" })
    return { attachments: atts, value }
  }

  #cursor(): number {
    const v = this.state.value ?? ""
    return Math.max(0, Math.min(v.length, this.state.cursor ?? 0))
  }

  #deleteRange(start: number, end: number): void {
    const v = this.state.value ?? ""
    this.#historyEdit()
    this.#preferredCol = undefined
    this.state.set({ cursor: start, value: v.slice(0, start) + v.slice(end) })
  }

  historyAdd(value: string): void {
    this.#historyAdd(value)
  }

  #historyAdd(value: string): void {
    if (value.trim() === "") return
    if (this.#history.at(-1) !== value) {
      this.#history.push(value)
      void this.emit("history", { added: value, history: [...this.#history] })
    }
    this.#historyDraft = ""
    this.#historyIndex = undefined
  }

  #historyEdit(): void {
    this.#historyDraft = ""
    this.#historyIndex = undefined
  }

  #historyNext(): void {
    if (this.#historyIndex === undefined) return
    const next = this.#historyIndex + 1
    if (next >= this.#history.length) {
      this.#historySet(this.#historyDraft)
      this.#historyDraft = ""
      this.#historyIndex = undefined
      return
    }
    this.#historyIndex = next
    this.#historySet(this.#history[next])
  }

  #historyPrev(): void {
    if (this.#history.length === 0) return
    if (this.#historyIndex === undefined) {
      this.#historyDraft = this.state.value ?? ""
      this.#historyIndex = this.#history.length - 1
    } else if (this.#historyIndex > 0) this.#historyIndex--
    this.#historySet(this.#history[this.#historyIndex])
  }

  #historySet(value: string): void {
    this.#preferredCol = undefined
    this.state.set({ cursor: value.length, value })
  }

  #markerRange(pos: number, dir: "back" | "forward"): { start: number; end: number } | undefined {
    const value = this.state.value ?? ""
    for (const att of this.#staged) {
      const start = value.indexOf(att.marker)
      if (start === -1) continue
      const end = start + att.marker.length
      if (dir === "back" && pos > start && pos <= end) return { end, start }
      if (dir === "forward" && pos >= start && pos < end) return { end, start }
    }
  }

  // Fallback path for anything the router couldn't resolve to a named
  // action: printable characters go straight into the value. Any other
  // unbound key (f7, unclaimed ctrl-combos, etc.) bubbles untouched.
  #handleKey(ev: RoutedKey): void {
    if (ev.text === undefined || ev.ctrl || ev.alt || ev.meta) return
    this.insert(ev.text)
    ev.stop()
  }

  #format(value: string, ctx: RenderCtx): string {
    const format = this.state.format
    if (!format) return value

    if (ctx.version !== this.#formatCache.version) {
      this.#formatCache.clear()
      this.#formatCache.version = ctx.version
    }

    const key = hash(value)
    const cached = this.#formatCache.get(key)
    if (cached?.result !== undefined) return cached.result
    const streaming = this.#streamingFormat(value)
    if (cached?.promise) return streaming ?? value

    const ret = format(value, { style: ctx.style })
    if (!isPromiseLike(ret)) return ret

    const gen = ++this.#formatGen
    const entry: FormatEntry = { input: value }
    entry.promise = ret.then(
      (result) => {
        if (this.#formatCache.get(key) !== entry) return
        entry.result = result
        entry.promise = undefined
        if (this.#formatGen === gen && result !== value) untrack(() => this.invalidate())
      },
      () => {
        if (this.#formatCache.get(key) === entry) this.#formatCache.delete(key)
      }
    )
    this.#formatCache.set(key, entry)
    while (this.#formatCache.size > 100)
      this.#formatCache.delete(this.#formatCache.keys().next().value!)
    return streaming ?? value
  }

  /** Reuse a highlighted prefix while async formatting catches up. */
  #streamingFormat(value: string): string | undefined {
    let ret: [string, FormatEntry] | undefined
    for (const [key, cached] of this.#formatCache) {
      if (cached.result === undefined) continue
      if (value.startsWith(cached.input) && cached.input.length > (ret?.[1].input.length ?? 0))
        ret = [key, cached]
    }
    if (ret === undefined) return
    this.#formatCache.delete(ret[0])
    this.#formatCache.set(ret[0], ret[1]) // bump to end of LRU
    return ret[1].result + value.slice(ret[1].input.length)
  }

  protected async _render(ctx: RenderCtx): Promise<string[]> {
    const value = this.state.value ?? ""
    const placeholder = this.state.placeholder ?? ""
    const cursor = this.#cursor()
    const focused = this.#focused

    // Build the styled content string. Layout (word-wrap, split into
    // rows, pad to width) is delegated to `Text` below — wrap-ansi knows
    // how to close+reopen SGR across line breaks, so the inverse-cursor
    // span survives wrapping.
    let content: string
    if (value === "") {
      const ph = unwrap(placeholder)
      content = ph ? ` ${ctx.style.quiet(ph)}` : ""
    } else {
      content = value
      for (const att of this.#staged) {
        if (!content.includes(att.marker)) continue
        content = content.replace(att.marker, ctx.style.accent(att.marker))
      }
      content = this.#format(content, ctx)
    }

    // Fake cursor. `cursor` is an absolute index in the raw value, while
    // rendering is line-oriented: newlines consume string indices but not
    // cells in any rendered row. Project the cursor to line/column before
    // slicing the formatted line.
    if (focused && this.ctx?.input.terminalFocus) {
      const { col, line } = posToLineCol(value, cursor)
      const lines = splitAnsi(content)
      const target = Math.max(0, Math.min(line, lines.length - 1))
      const row = lines[target] ?? ""
      const head = sliceAnsi(row, 0, col)
      const at = sliceAnsi(row, col, col + 1) || " "
      const tail = sliceAnsi(row, col + 1)
      lines[target] = head + ctx.style.inverse(at) + tail
      content = lines.join("\n")
    }

    return formatText(content, {
      style: ctx.style.add(this.state),
      width: ctx.width,
      wrap: "word",
    })
  }
}

/**
 * Factory for `Input`. All fields optional; default is an empty,
 * focusable input that fills `ctx.width` and has no placeholder.
 *
 * ```ts
 * input({ placeholder: "type a message…" })
 * const i = input({ value: "draft" })
 * i.on("submit", (text) => console.log("user typed", text))
 * ```
 */
export function input(state: InputState = {}): Input {
  return new Input(state)
}

// ---------- helpers ----------

function isWhitespace(ch: string | undefined): boolean {
  return ch !== undefined && (ch === " " || ch === "\t" || ch === "\n")
}

function posToLineCol(value: string, cursor: number): { line: number; col: number } {
  const prefix = value.slice(0, cursor)
  const lineStart = prefix.lastIndexOf("\n") + 1
  return {
    line: prefix.split("\n").length - 1,
    col: stringWidth(prefix.slice(lineStart)),
  }
}

function lineColToPos(value: string, line: number, col: number): number {
  const lines = value.split("\n")
  const clampLine = Math.max(0, Math.min(line, lines.length - 1))
  let abs = 0
  for (let i = 0; i < clampLine; i++) abs += lines[i].length + 1

  let cells = 0
  let offset = 0
  for (const ch of lines[clampLine]) {
    const width = stringWidth(ch)
    if (cells + width > col) break
    cells += width
    offset += ch.length
  }
  return abs + offset
}

function lineEndPos(value: string, cursor: number): number {
  let i = cursor
  while (i < value.length && value[i] !== "\n") i++
  return i
}

function countLines(value: string): number {
  let n = 1
  for (const ch of value) if (ch === "\n") n++
  return n
}
