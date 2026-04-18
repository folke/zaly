import type { RenderCtx } from "../core/ctx.ts"
import type { Size } from "../layout/size.ts"
import type { Style } from "../style/ansi.ts"

import { sliceAnsi, stringWidth, wrapAnsi } from "#runtime"
import { NodeBase } from "../core/node.ts"
import { resolveSize } from "../layout/size.ts"
import { openStyle, RESET } from "../style/ansi.ts"

export interface TextStyle extends Style {
  content: string
  width?: Size
  wrap?: "word" | "char" | "none"
}

export class Text extends NodeBase<TextStyle> {
  protected _render(ctx: RenderCtx): string[] {
    const mode = this.state.wrap ?? "word"
    const widthSpec = this.state.width ?? "fill"
    const w = resolveSize(widthSpec, ctx.width) ?? naturalWidth(this.state.content, mode)

    const rows =
      mode === "none" ? this.state.content.split("\n") : wrapAnsi(this.state.content, w, { mode })
    const padded = rows.map((row) => padOrClip(row, w))

    const open = openStyle(this.state, ctx.theme)
    if (open === "") return padded
    return padded.map((row) => open + row + RESET)
  }
}

/**
 * Factory for `Text`. The string form is the common case; pass a full
 * `TextStyle` object when you need content + style in one literal.
 *
 * ```ts
 * text("hello")
 * text("hello", { fg: "primary", bold: true })
 * text({ content: "hello", fg: "primary" })
 * ```
 */
export function text(content: string, style?: Omit<TextStyle, "content">): Text
export function text(style: TextStyle): Text
export function text(first: string | TextStyle, style?: Omit<TextStyle, "content">): Text {
  if (typeof first === "string") return new Text({ content: first, ...style })
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
  if (w < width) return row + " ".repeat(width - w)
  return sliceAnsi(row, 0, width)
}
