import type { RenderCtx } from "../core/ctx.ts"
import type { Accessor, Reactive } from "../core/reactive.ts"
import type { State } from "../core/state.ts"
import type { WrapMode } from "../layout/text.ts"
import type { MdOptions } from "../markdown/types.ts"
import type { AnsiHighlighter } from "../style/shiki.ts"
import type { Image } from "./image.ts"

import { hasColors } from "@zaly/shared/env"
import { Node } from "../core/node.ts"
import { memo, unwrap } from "../core/reactive.ts"
import { calcLayout, formatText } from "../layout/text.ts"
import { shikiCodeLangs } from "../markdown/code.ts"
import { MarkdownRenderer } from "../markdown/renderer.ts"
import { shiki } from "../style/shiki.ts"

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
  #highlighter: Accessor<AnsiHighlighter | undefined>
  #lastSource?: string
  #lastRows?: string[]

  constructor(state: State<MarkdownState>) {
    super(state)
    this.#renderer = new MarkdownRenderer({ ...state.options, parent: this })

    const langs = memo(() =>
      this.state.syntax === false ? [] : shikiCodeLangs(unwrap(this.state.content))
    )

    this.#highlighter = shiki.createLoader(() => langs())
  }

  protected async _render(ctx: RenderCtx): Promise<string[]> {
    const source = unwrap(this.state.content) // tracked
    const formatted = !hasColors
      ? this.#renderer.normalizeEol(source, source)
      : await this.#renderer.render(source, { ...ctx, highlighter: this.#highlighter() })
    const ret = formatText(formatted, {
      width: ctx.width,
      wrap: this.state.wrap,
    })

    // When streaming updates, make sure we never shrink the rendered rows to prevent flickering.
    if (
      source.startsWith(this.#lastSource ?? "") &&
      this.#lastRows &&
      this.#lastRows.length > ret.length
    ) {
      ret.push(...Array.from({ length: this.#lastRows.length - ret.length }, () => ""))
    }
    this.#lastSource = source
    this.#lastRows = [...ret]
    return ret
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
