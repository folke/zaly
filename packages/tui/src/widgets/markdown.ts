import type { RenderCtx } from "../core/ctx.ts"
import type { Accessor, Reactive } from "../core/reactive.ts"
import type { State } from "../core/state.ts"
import type { WrapMode } from "../layout/text.ts"
import type { MarkdownCtx } from "../markdown/renderer.ts"
import type { MdOptions } from "../markdown/types.ts"
import type { Image } from "./image.ts"

import { hasColors } from "@zaly/shared/env"
import { Node } from "../core/node.ts"
import { createAsync, createStore, unwrap } from "../core/reactive.ts"
import { calcLayout, formatText } from "../layout/text.ts"
import { MarkdownRenderer } from "../markdown/renderer.ts"

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
  wrap?: WrapMode
}

export class Markdown extends Node<MarkdownState> {
  // Image nodes cached per-src per-Markdown-instance. Re-rendering the
  // same markdown (streaming updates) reuses the same `Image` — same
  // `placementId`, which the KGP spec guarantees is a flicker-free
  // move/resize of the existing placement.
  readonly images = new Map<string, Image>()

  #renderer: MarkdownRenderer
  /** Reactive struct mirroring `MarkdownCtx`. Per-field signals so a
   *  width change re-fires the highlight without theme/transmit also
   *  notifying, and value-equality short-circuits no-op writes. */
  #ctx = createStore<MarkdownCtx>({
    // Sentinel — `0` gates the createAsync below until `_render` fills
    // in the real ctx on first render.
    width: 0,
    // Other fields filled by `_render`. They start as `undefined` and
    // are read via the proxy as `undefined` until set.
  } as unknown as MarkdownCtx)
  #result: Accessor<string>

  constructor(state: State<MarkdownState>) {
    super(state)
    this.#renderer = new MarkdownRenderer({ ...state.options, parent: this })
    this.#result = createAsync(
      async () => {
        const source = unwrap(this.state.content) // tracked
        // Per-field reads on the proxy track. Re-fires when any of:
        // width / style / transmit / version / highlight flip value.
        if (!hasColors || this.#ctx.width === 0) return source
        return this.#renderer.render(source, this.#ctx)
      },
      { initialValue: unwrap(state.content) }
    )
  }

  protected async _render(ctx: RenderCtx): Promise<string[]> {
    // Bulk update; each underlying signal is `value === resolved`-gated,
    // so unchanged fields don't notify the createAsync effect.
    this.#ctx.update({
      highlight: this.state.syntax ?? true,
      style: ctx.style,
      transmit: ctx.transmit,
      version: ctx.version,
      width: ctx.width,
    })
    return formatText(this.#result(), {
      width: ctx.width,
      wrap: this.state.wrap,
    })
  }

  override layout() {
    return calcLayout(unwrap(this.state.content))
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
  style?: Omit<State<MarkdownState>, "content">
): Markdown
export function markdown(state: State<MarkdownState>): Markdown
export function markdown(
  first: Reactive<string> | MarkdownState,
  style?: Omit<State<MarkdownState>, "content">
): Markdown {
  // Plain strings and accessor functions go through the content path;
  // a non-function object is the full state form.
  if (typeof first === "string" || typeof first === "function") {
    return new Markdown({ content: first, ...style })
  }
  return new Markdown(first)
}
