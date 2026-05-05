import type { RenderCtx, StyleState } from "../core/ctx.ts"
import type { Reactive } from "../core/reactive.ts"
import type { Flexible } from "../layout/flex.ts"

import { Node } from "../core/node.ts"
import { unwrap } from "../core/reactive.ts"
import { formatText } from "../layout/text.ts"

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

    const rows = formatText(content, {
      available: ctx.width,
      width: this.state.width,
      wrap: this.state.wrap,
    })

    const style = ctx.style.add(this.state)
    return rows.map((row) => style(row))
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
