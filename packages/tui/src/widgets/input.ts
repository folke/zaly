import type { DetectedFile } from "@zaly/shared/detect"
import type { RenderCtx } from "../core/ctx.ts"
import type { BaseEvents } from "../core/node.ts"
import type { StyleState } from "../core/state.ts"
import type { ActionMap } from "../input/actions.ts"
import type { RoutedKey } from "../input/router.ts"
import type { Size } from "../layout/size.ts"
import type { StyleBuilder } from "../style/builder.ts"

import { sliceAnsi, stringWidth } from "@zaly/shared/ansi"
import { fileDetect } from "@zaly/shared/detect"
import { basename } from "pathe"
import { Node } from "../core/node.ts"
import { clipboard } from "../input/clipboard.ts"
import { formatText } from "../layout/text.ts"

export interface InputState extends StyleState {
  /** Current text content. May include `\n` for multi-line input. */
  value?: string
  /** Shown dim when `value` is empty. */
  placeholder?: string
  /** Cursor position as a char index in `value`. Clamped to `[0, value.length]`. */
  cursor?: number
  /** Render width. Defaults to `fill`. */
  width?: Size
  /** Threshold for showing pasted content as an attachment rather than raw text */
  pasteMaxLines?: number
  pasteMaxChars?: number
}

const PASTE_MAX_LINES = 5
const PASTE_MAX_CHARS = 1000

/** A clipboard or bracketed paste that exceeds the `pasteMax*` thresholds. **/
type Paste = { type: "paste"; text: string }

/** A file or image attachment detected from the clipboard. */
export type InputAttachment = DetectedFile & { path: string }

export type InputEvents = BaseEvents & {
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
  #staged: ((InputAttachment | Paste) & { id: number; marker: string })[] = []
  canAttach?: (file: InputAttachment) => boolean
  format?: (value: string, ctx: { style: StyleBuilder }) => string

  /**
   * Editing actions. Parameterless — they close over `this` — so both
   * the router (via keymap dispatch) and application code can invoke
   * them. Add to the keymap in `src/input/actions.ts` to give them
   * default key bindings.
   */
  override actions = {
    "input.cursorDown": (): void => {
      const v = this.state.value ?? ""
      const { col, line } = posToLineCol(v, this.state.cursor ?? 0)
      if (line >= countLines(v) - 1) return
      this.state.cursor = lineColToPos(v, line + 1, col)
    },
    "input.cursorLeft": (): void => {
      const c = this.state.cursor ?? 0
      if (c > 0) this.state.cursor = c - 1
    },
    "input.cursorLineEnd": (): void => {
      const v = this.state.value ?? ""
      this.state.cursor = lineEndPos(v, this.state.cursor ?? 0)
    },
    "input.cursorLineStart": (): void => {
      const v = this.state.value ?? ""
      const { line } = posToLineCol(v, this.state.cursor ?? 0)
      this.state.cursor = lineColToPos(v, line, 0)
    },
    "input.cursorRight": (): void => {
      const v = this.state.value ?? ""
      const c = this.state.cursor ?? 0
      if (c < v.length) this.state.cursor = c + 1
    },
    "input.cursorUp": (): void => {
      const v = this.state.value ?? ""
      const { col, line } = posToLineCol(v, this.state.cursor ?? 0)
      if (line === 0) return
      this.state.cursor = lineColToPos(v, line - 1, col)
    },
    "input.deleteCharBack": (): void => {
      const v = this.state.value ?? ""
      const c = this.state.cursor ?? 0
      if (c === 0) return
      const marker = this.#markerRange(c, "back")
      if (marker) return this.#deleteRange(marker.start, marker.end)
      this.state.set({ cursor: c - 1, value: v.slice(0, c - 1) + v.slice(c) })
    },
    "input.deleteCharForward": (): void => {
      const v = this.state.value ?? ""
      const c = this.state.cursor ?? 0
      if (c >= v.length) return
      const marker = this.#markerRange(c, "forward")
      if (marker) return this.#deleteRange(marker.start, marker.end)
      this.state.value = v.slice(0, c) + v.slice(c + 1)
    },
    "input.deleteWordBack": (): void => {
      const v = this.state.value ?? ""
      const c = this.state.cursor ?? 0
      let i = c
      while (i > 0 && isWhitespace(v[i - 1])) i--
      while (i > 0 && !isWhitespace(v[i - 1])) i--
      if (i === c) return
      this.state.set({ cursor: i, value: v.slice(0, i) + v.slice(c) })
    },
    "input.insertNewline": (): void => {
      // Smart indent: copy the leading whitespace of the current
      // logical line onto the new line so continuations stay aligned
      // with the bullet / quote / prefix the user typed.
      const v = this.state.value ?? ""
      const c = this.state.cursor ?? 0
      let lineStart = c
      while (lineStart > 0 && v[lineStart - 1] !== "\n") lineStart--
      let indent = ""
      for (let i = lineStart; i < c; i++) {
        const ch = v[i]
        if (ch === " " || ch === "\t") indent += ch
        else break
      }
      const insert = `\n${indent}`
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
      const c = this.state.cursor ?? 0
      const tab = "  "
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
      void this.emit("submit", this.consume())
    },
  } satisfies ActionMap

  constructor(initial: InputState = {}) {
    const value = initial.value ?? ""
    super({ cursor: value.length, value, ...initial })
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
  }

  attach(att: InputAttachment | Paste): void {
    if (att.type !== "paste" && this.canAttach?.(att) === false) {
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
    const c = this.state.cursor ?? 0
    this.state.set({
      cursor: c + text.length,
      value: v.slice(0, c) + text + v.slice(c),
    })
  }

  /** Consume the input's current value and attachments.
   * Pastes are replaced inline with their text; file/image
   * attachments are returned in the `attachments` array and removed from the value. */
  consume(): { value: string; attachments: InputAttachment[] } {
    let value = this.state.value ?? ""
    const atts: InputAttachment[] = []
    for (const att of this.#staged) {
      if (!value.includes(att.marker)) continue
      if (att.type === "paste") {
        value = value.replace(att.marker, att.text)
      } else atts.push(att)
    }
    this.#staged = []
    this.state.set({ cursor: 0, value: "" })
    return { attachments: atts, value }
  }

  #deleteRange(start: number, end: number): void {
    const v = this.state.value ?? ""
    this.state.set({ cursor: start, value: v.slice(0, start) + v.slice(end) })
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

  protected async _render(ctx: RenderCtx): Promise<string[]> {
    const value = this.state.value ?? ""
    const placeholder = this.state.placeholder ?? ""
    const cursor = Math.max(0, Math.min(value.length, this.state.cursor ?? 0))
    const focused = this.#focused

    // Build the styled content string. Layout (word-wrap, split into
    // rows, pad to width) is delegated to `Text` below — wrap-ansi knows
    // how to close+reopen SGR across line breaks, so the inverse-cursor
    // span survives wrapping.
    let content: string
    if (value === "") {
      if (placeholder === "") {
        content = focused ? ctx.style.inverse(" ") : ""
      } else {
        content = focused
          ? ctx.style.inverse(" ") + ctx.style.quiet(` ${placeholder}`)
          : ctx.style.quiet(placeholder)
      }
    } else {
      content = value
      for (const att of this.#staged) {
        if (!content.includes(att.marker)) continue
        content = content.replace(att.marker, ctx.style.accent(att.marker))
      }
      content = this.format ? this.format(content, { style: ctx.style }) : content
      if (focused) {
        // Inverse-video cursor overlaid on the char at `cursor`; on trailing
        // cursors (past the last char) we overlay a space so it's visible.
        const head = sliceAnsi(content, 0, cursor)
        const at = sliceAnsi(content, cursor, cursor + 1) || " "
        const tail = sliceAnsi(content, cursor + 1)
        content = head + ctx.style.inverse(at) + tail
      }
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
  let line = 0
  let col = 0
  for (let i = 0; i < cursor; i++) {
    if (value[i] === "\n") {
      line++
      col = 0
    } else col++
  }
  return { col, line }
}

function lineColToPos(value: string, line: number, col: number): number {
  const lines = value.split("\n")
  const clampLine = Math.max(0, Math.min(line, lines.length - 1))
  let abs = 0
  for (let i = 0; i < clampLine; i++) abs += lines[i].length + 1
  return abs + Math.min(col, lines[clampLine].length)
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
