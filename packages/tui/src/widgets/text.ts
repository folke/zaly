import type { RenderCtx, StyleState } from "../core/ctx.ts"
import type { Reactive } from "../core/reactive.ts"
import type { Flexible } from "../layout/flex.ts"

import { Node } from "../core/node.ts"
import { unwrap } from "../core/reactive.ts"
import { resolveSize } from "../layout/size.ts"
import { padOrClip, splitAnsi, stringWidth, wrapAnsi } from "../style/ansi.ts"

/**
 * Text content — three forms, resolved at render time:
 *
 *   1. Plain string — static content.
 *   2. Reactive accessor (`signal()` / `memo()`) — re-reads on each
 *      render and subscribes the node so signal writes invalidate.
 *   3. `(ctx) => string` — computed from the render context. Use this
 *      for inline-styled spans via `ctx.style`.
 *
 * Branded accessors are picked up via `isAccessor`; any other function
 * is treated as the ctx-aware form. Plain strings pass through.
 *
 * ```ts
 * text("hello")
 * text(name)                                  // signal accessor
 * text(({ style }) => style.ok(`✓ ${count}`)) // ctx-aware
 * ```
 */
export type TextContent = Reactive<string> | ((ctx: RenderCtx) => string)

export interface TextStyle extends StyleState, Flexible {
  content: TextContent
  wrap?: "word" | "char" | "none"
}

export class Text extends Node<TextStyle> {
  protected _render(ctx: RenderCtx): string[] {
    const raw = unwrap(this.state.content)
    const content = typeof raw === "string" ? raw : raw(ctx)
    const mode = this.state.wrap ?? "word"
    const widthSpec = this.state.width

    // Wrap budget — full ctx width by default, so wrapping breaks at
    // sensible column counts. Explicit numeric / `"fill"` widths use
    // that as the wrap target *and* pad/clip emitted rows to it.
    // `"fit"` (or unset) uses ctx.width to wrap but emits rows at
    // their natural widths so a parent box's `width: "fit"` can
    // measure content correctly.
    const wrapBudget = resolveSize(widthSpec ?? "fill", ctx.width) ?? naturalWidth(content, mode)
    const rows = splitAnsi(mode === "none" ? content : wrapAnsi(content, wrapBudget, { mode }))

    // Pad/clip only when the caller asked for a specific layout width.
    // The default (unset) path returns natural-width rows — text is a
    // content node, the parent box is responsible for filling the slot
    // (via `padRow(row, inner)` in `box._render`) and applying any
    // backdrop bg.
    const explicit = widthSpec !== undefined && widthSpec !== "fit"
    const out = explicit ? rows.map((row) => padOrClip(row, wrapBudget)) : rows

    // Pre-bind the wrapper once — creating a fresh builder per row would
    // allocate a Proxy per iteration. Inner SGR resets (from content or
    // from padOrClip closing a wrap-open style) get the full style
    // re-applied after them; shiki-style per-token fgs still win on
    // subsequent text because terminal SGR is cumulative until RESET.
    const wrap = ctx.style.add(this.state)
    return out.map((row) => wrap(row))
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
  // TextContent: string | function (incl. reactive accessor) | …
  // TextStyle:   plain object with a `content` field.
  // The TextStyle branch is picked only when `first` is a non-function
  // object — accessors are functions, so they go through the content path.
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
