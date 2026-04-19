import type { RenderCtx } from "../core/ctx.ts"
import type { Size } from "../layout/size.ts"
import type { Style } from "../style/ansi.ts"

import { sliceAnsi, stringWidth, wrapAnsi } from "#runtime"
import { Node } from "../core/node.ts"
import { resolveSize } from "../layout/size.ts"
import { openStyle, RESET, splitAnsi } from "../style/ansi.ts"
import { reapplyBg } from "../style/compose.ts"

/**
 * Text content — a plain string, or a function that produces one from the
 * render context. Use the function form when you want inline-styled spans
 * via `ctx.style`:
 *
 * ```ts
 * text(({ style }) => `  lines: ${style.ok("+12")} ${style.err("-4")}`)
 * ```
 */
export type TextContent = string | ((ctx: RenderCtx) => string)

export interface TextStyle extends Style {
  content: TextContent
  width?: Size
  wrap?: "word" | "char" | "none"
}

export class Text extends Node<TextStyle> {
  protected _render(ctx: RenderCtx): string[] {
    const content =
      typeof this.state.content === "function" ? this.state.content(ctx) : this.state.content
    const mode = this.state.wrap ?? "word"
    const widthSpec = this.state.width ?? "fill"
    const w = resolveSize(widthSpec, ctx.width) ?? naturalWidth(content, mode)

    // wrapAnsi may leave SGR state open across its inserted newlines
    // (Bun.wrapAnsi does this; wrap-ansi closes + re-opens). splitAnsi
    // normalizes either way, uniformly with the explicit-newline case.
    const rows = splitAnsi(mode === "none" ? content : wrapAnsi(content, w, { mode }))
    const padded = rows.map((row) => padOrClip(row, w))

    const open = openStyle(this.state, ctx.theme)
    const bgOnly = this.state.bg === undefined ? "" : openStyle({ bg: this.state.bg }, ctx.theme)
    if (bgOnly !== "") {
      // Inner RESETs — whether from content or injected by padOrClip to close
      // a wrap-open style — would clobber Text's bg. Re-apply after each one.
      return padded.map((row) => open + reapplyBg(row, bgOnly) + RESET)
    }
    if (open !== "") return padded.map((row) => open + row + RESET)
    return padded
  }
}

/**
 * Factory for `Text`. Content can be a plain string or a `(ctx) => string`
 * function that's called at render time — use the function form when you
 * want inline-styled spans via `ctx.style`.
 *
 * ```ts
 * text("hello")
 * text("hello", { fg: "primary", bold: true })
 * text({ content: "hello", fg: "primary" })
 * text(({ style }) => `ok: ${style.ok("yes")}`)
 * ```
 */
export function text(content: TextContent, style?: Omit<TextStyle, "content">): Text
export function text(style: TextStyle): Text
export function text(first: TextContent | TextStyle, style?: Omit<TextStyle, "content">): Text {
  if (typeof first === "string" || typeof first === "function") {
    return new Text({ content: first, ...style })
  }
  return new Text(first)
}

function naturalWidth(content: string, mode: "word" | "char" | "none"): number {
  if (mode === "none") {
    let max = 0
    for (const line of content.split("\n")) max = Math.max(max, stringWidth(line))
    return max
  }
  if (mode === "char") {
    // Widest single grapheme — approximate as widest 1-cell unit. For plain
    // ASCII that's 1; emoji etc. may be 2.
    let max = 1
    for (const ch of content) max = Math.max(max, stringWidth(ch))
    return max
  }
  // word mode: widest single word (CSS min-content)
  let max = 0
  for (const word of content.split(/\s+/)) max = Math.max(max, stringWidth(word))
  return max
}

function padOrClip(row: string, width: number): string {
  const w = stringWidth(row)
  if (w === width) return row
  if (w < width) {
    // If the row carries any styling, close it before the pad spaces so they
    // don't inherit an open style. splitAnsi already ensures per-line close/
    // reopen — this is belt-and-suspenders for any weird content. Plain rows
    // skip the RESET so output stays byte-identical to the no-style path.
    const tail = row.includes("\x1b[") ? RESET : ""
    return row + tail + " ".repeat(width - w)
  }
  return sliceAnsi(row, 0, width)
}
