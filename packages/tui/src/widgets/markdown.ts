import type { RenderCtx } from "../core/ctx.ts"
import type { Reactive } from "../core/reactive.ts"
import type { Size } from "../layout/size.ts"
import type { WrapMode } from "../layout/text.ts"
import type { MdOptions } from "../markdown/index.ts"
import type { Image } from "./image.ts"

import { Node } from "../core/node.ts"
import { unwrap } from "../core/reactive.ts"
import { formatText } from "../layout/text.ts"
import { createCallbacks } from "../markdown/callbacks.ts"
import { createCodeHighlighter } from "../markdown/code.ts"
import { createImageCallback } from "../markdown/image.ts"

export interface MarkdownState {
  /** Markdown source. Accepts a plain string or a reactive accessor —
   *  pass `signal()` / `memo()` for streaming content that re-parses on
   *  each render and subscribes the node to the signal. */
  content: Reactive<string>
  /** Options forwarded to `renderMarkdown`. */
  options?: MdOptions
  /**
   * Enable shiki-backed syntax highlighting for fenced code blocks. Defaults
   * to `true` — code blocks get per-token colors from the shiki theme, with
   * `mdCodeBlock`'s bg applied as a backdrop. Unknown languages fall through
   * as plain text.
   */
  syntax?: boolean
  width?: Size
  wrap?: WrapMode
}

export class Markdown extends Node<MarkdownState> {
  // Image nodes cached per-src per-Markdown-instance. Re-rendering the
  // same markdown (streaming updates) reuses the same `Image` — same
  // `placementId`, which the KGP spec guarantees is a flicker-free
  // move/resize of the existing placement.
  readonly images = new Map<string, Image>()

  protected async _render(ctx: RenderCtx): Promise<string[]> {
    const { renderMarkdown } = await import("#md")
    const fn = this.state.options?.render ?? renderMarkdown

    const source = unwrap(this.state.content)

    const callbacks = createCallbacks({
      ...ctx,
      highlighter: (this.state.syntax ?? true) ? await createCodeHighlighter(source) : undefined,
    })

    // Image handling: the callback emits `<img id=N>` markers during
    // rendering; a post-processing resolver then renders the referenced
    // images concurrently and splices their rows back in. Keeps the
    // markdown callback surface synchronous while supporting async
    // image preparation.
    const image = createImageCallback(this)
    callbacks.image = image.cb

    const rendered = fn(source, callbacks, this.state.options)
    const final = await image.resolve(ctx, rendered)

    // Mirror the source's trailing newlines: the renderer adds its own
    // padding after blocks (`\n\n` after paragraphs, etc.) which would
    // leave stray blank rows. Normalizing to what the caller typed keeps
    // single-line inputs compact and preserves explicit spacing when
    // they asked for it.
    const trailing = /\n*$/.exec(source)?.[0] ?? ""
    return formatText(final.replace(/\n+$/, trailing), {
      available: ctx.width,
      width: this.state.width,
      wrap: this.state.wrap,
    })
  }
}

/**
 * Render a markdown string as a TUI node. Produces ANSI-styled text that
 * resolves per-element styling through theme slots (`mdHeading1`, `mdCode`,
 * `mdLink`, …). Links become clickable in terminals that support OSC 8.
 *
 * ```ts
 * markdown("# Hello\n\nThis is **bold** and *italic*.")
 * markdown({ content, wrap: "word", fg: "fg" })
 * ```
 */
export function markdown(
  content: Reactive<string>,
  style?: Omit<MarkdownState, "content">
): Markdown
export function markdown(state: MarkdownState): Markdown
export function markdown(
  first: Reactive<string> | MarkdownState,
  style?: Omit<MarkdownState, "content">
): Markdown {
  // Plain strings and accessor functions go through the content path;
  // a non-function object is the full state form.
  if (typeof first === "string" || typeof first === "function") {
    return new Markdown({ content: first, ...style })
  }
  return new Markdown(first)
}
