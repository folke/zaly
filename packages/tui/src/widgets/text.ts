import type { MaybePromise } from "@zaly/shared"
import type { RenderCtx } from "../core/ctx.ts"
import type { Reactive } from "../core/reactive.ts"
import type { State } from "../core/state.ts"
import type { Style } from "../style/types.ts"

import { Node } from "../core/node.ts"
import { unwrap } from "../core/reactive.ts"
import { calcLayout, formatText } from "../layout/text.ts"

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
export type TextContent = Reactive<string> | ((ctx: RenderCtx) => MaybePromise<Reactive<string>>)

export interface TextStyle extends Style {
  content: TextContent
  wrap?: "word" | "char" | "none"
}

export class Text extends Node<TextStyle> {
  protected async _render(ctx: RenderCtx): Promise<string[]> {
    const content = await textContent(this.state.content, ctx)
    return formatText(content, {
      style: ctx.style.add(this.state),
      width: ctx.width,
      wrap: this.state.wrap,
    })
  }

  override async layout(ctx: RenderCtx) {
    return calcLayout(await textContent(this.state.content, ctx))
  }
}

export function textContent(content: TextContent, ctx: RenderCtx): Promise<string>
export function textContent(content: TextContent | undefined, ctx: RenderCtx): Promise<undefined>
export async function textContent(
  content: TextContent | undefined,
  ctx: RenderCtx
): Promise<string | undefined> {
  if (content === undefined) return
  const raw = unwrap(content)
  return unwrap(typeof raw === "string" ? raw : await raw(ctx))
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
export function text(content: TextContent, style?: Omit<State<TextStyle>, "content">): Text
export function text(style: State<TextStyle>): Text
export function text(
  first: TextContent | State<TextStyle>,
  style?: Omit<State<TextStyle>, "content">
): Text {
  // TextContent: string | function (incl. reactive accessor) | …
  // TextStyle:   plain object with a `content` field.
  // The TextStyle branch is picked only when `first` is a non-function
  // object — accessors are functions, so they go through the content path.
  if (typeof first === "string" || typeof first === "function") {
    return new Text({ content: first, ...style })
  }
  return new Text(first)
}
