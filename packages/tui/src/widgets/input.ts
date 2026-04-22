import type { RenderCtx, StyleState } from "../core/ctx.ts"
import type { BaseEvents } from "../core/node.ts"
import type { ActionMap } from "../input/actions.ts"
import type { RoutedKey, RoutedPaste } from "../input/router.ts"
import type { Size } from "../layout/size.ts"

import { Node } from "../core/node.ts"
import { clipboard } from "../input/clipboard.ts"
import { Text } from "./text.ts"

export interface InputState extends StyleState {
  /** Current text content. May include `\n` for multi-line input. */
  value?: string
  /** Shown dim when `value` is empty. */
  placeholder?: string
  /** Cursor position as a char index in `value`. Clamped to `[0, value.length]`. */
  cursor?: number
  /** Render width. Defaults to `fill`. */
  width?: Size
}

export interface InputEvents extends BaseEvents {
  /** Fired when plain Enter is pressed. Payload is the current value. */
  submit: [string]
  /** Fired when the user pastes a non-text resource via the
   *  `input.clipboard` action. Currently covers two shapes:
   *
   *    - **image** — the clipboard held image bytes; `path` is a
   *      temporary PNG file and the caller takes ownership.
   *    - **file** — the clipboard held file references (e.g. from the
   *      OS file manager); `path` is the real filesystem path. One
   *      `attach` event fires per file.
   *
   *  `type` is a MIME string. `"image/png"` for image pastes; for
   *  files it's a best-effort guess (`"application/octet-stream"`
   *  when unknown) — callers typically re-sniff via their own tools. */
  attach: [path: string, type: string]
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
  #text: Text

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
      this.state.value = v.slice(0, c - 1) + v.slice(c)
      this.state.cursor = c - 1
    },
    "input.deleteCharForward": (): void => {
      const v = this.state.value ?? ""
      const c = this.state.cursor ?? 0
      if (c >= v.length) return
      this.state.value = v.slice(0, c) + v.slice(c + 1)
    },
    "input.deleteWordBack": (): void => {
      const v = this.state.value ?? ""
      const c = this.state.cursor ?? 0
      let i = c
      while (i > 0 && isWhitespace(v[i - 1])) i--
      while (i > 0 && !isWhitespace(v[i - 1])) i--
      if (i === c) return
      this.state.value = v.slice(0, i) + v.slice(c)
      this.state.cursor = i
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
      this.state.value = v.slice(0, c) + insert + v.slice(c)
      this.state.cursor = c + insert.length
    },
    "input.insertTab": (): void => {
      // Two spaces rather than `\t` — terminal tab stops are
      // unpredictable (often 8 cells) and play badly with our per-row
      // layout. Soft tabs are the safer default; users wanting real
      // tabs can override the action.
      const v = this.state.value ?? ""
      const c = this.state.cursor ?? 0
      const tab = "  "
      this.state.value = v.slice(0, c) + tab + v.slice(c)
      this.state.cursor = c + tab.length
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
        if (content.kind === "image") {
          this.emit("attach", content.path, content.type)
          return
        }
        if (content.kind === "files") {
          for (const path of content.paths) {
            this.emit("attach", path, guessMime(path))
          }
          return
        }
        // kind === "text"
        const v = this.state.value ?? ""
        const c = this.state.cursor ?? 0
        this.state.value = v.slice(0, c) + content.text + v.slice(c)
        this.state.cursor = c + content.text.length
      })()
    },
    "input.submit": (): void => {
      this.emit("submit", this.state.value ?? "")
    },
  } satisfies ActionMap

  constructor(initial: InputState = {}) {
    const value = initial.value ?? ""
    super({ cursor: value.length, value, ...initial })
    this.on("key", (ev) => {
      this.#handleKey(ev)
    })
    this.on("paste", (ev) => {
      this.#handlePaste(ev)
    })
    this.on("focus", () => {
      this.#focused = true
      this.invalidate()
    })
    this.on("blur", () => {
      this.#focused = false
      this.invalidate()
    })
    // Drop Input-only control fields before handing state to the
    // child Text. Without this, `focus: true` would autofocus the
    // Text instead of the Input on mount (children mount after their
    // parent, so the Text's autofocus would override the Input's).
    this.#text = new Text({
      ...this.omitFromState("cursor", "placeholder", "value", "visible"),
      content: "",
    })
    this.add(this.#text)
  }

  // Fallback path for anything the router couldn't resolve to a named
  // action: printable characters go straight into the value. Any other
  // unbound key (f7, unclaimed ctrl-combos, etc.) bubbles untouched.
  #handleKey(ev: RoutedKey): void {
    if (ev.text === undefined || ev.ctrl || ev.alt || ev.meta) return
    const v = this.state.value ?? ""
    const c = this.state.cursor ?? 0
    this.state.value = v.slice(0, c) + ev.text + v.slice(c)
    this.state.cursor = c + ev.text.length
    ev.stop()
  }

  #handlePaste(ev: RoutedPaste): void {
    const v = this.state.value ?? ""
    const c = this.state.cursor ?? 0
    this.state.value = v.slice(0, c) + ev.text + v.slice(c)
    this.state.cursor = c + ev.text.length
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
          ? ctx.style.inverse(" ") + ctx.style.dim(` ${placeholder}`)
          : ctx.style.dim(placeholder)
      }
    } else if (focused) {
      // Inverse-video cursor overlaid on the char at `cursor`; on trailing
      // cursors (past the last char) we overlay a space so it's visible.
      const head = value.slice(0, cursor)
      const at = value[cursor] ?? " "
      const tail = value.slice(cursor + 1)
      content = head + ctx.style.inverse(at) + tail
    } else {
      content = value
    }

    // Forward the non-content InputState fields that Text understands
    // (bg/fg/attrs via Style, plus width). Keep `wrap: "word"` as the
    // default for a pleasant chat-style input.
    this.#text.setState({
      ...this.omitFromState("cursor", "placeholder", "value", "visible"),
      content,
    })
    return this.#text.render(ctx)
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

/** Best-effort MIME guess from a file extension. Returns
 *  `application/octet-stream` for anything unknown — the caller that
 *  cares about MIME should re-sniff via its own tools (or `file(1)`). */
function guessMime(path: string): string {
  const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase()
  const MIMES: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    pdf: "application/pdf",
    md: "text/markdown",
    txt: "text/plain",
    json: "application/json",
    html: "text/html",
    mp4: "video/mp4",
    mov: "video/quicktime",
    mp3: "audio/mpeg",
    wav: "audio/wav",
  }
  return MIMES[ext] ?? "application/octet-stream"
}
