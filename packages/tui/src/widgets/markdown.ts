import type { RenderCtx } from "../core/ctx.ts"
import type { Accessor, Reactive } from "../core/reactive.ts"
import type { State } from "../core/state.ts"
import type { WrapMode } from "../layout/text.ts"
import type { MarkdownRenderer } from "../markdown/renderer.ts"
import type { MdOptions } from "../markdown/types.ts"
import type { ShikiTheme } from "../shiki/types.ts"
import type { AnyStyle } from "../style/types.ts"
import type { Image } from "./image.ts"

import { hasColors } from "@zaly/shared/env"
import { Node } from "../core/node.ts"
import { createAsync, signal, unwrap } from "../core/reactive.ts"
import { calcLayout, formatText } from "../layout/text.ts"
import { shikiWorker } from "../shiki/client.ts"
import { codeToAnsi } from "../shiki/shiki.ts"

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
  style?: AnyStyle
}

type ShikiCode = {
  key: string
  code: string
  lang: string
  theme?: ShikiTheme
  inflight?: Promise<string>
  result?: string
}

export class Markdown extends Node<MarkdownState> {
  // Image nodes cached per-src per-Markdown-instance. Re-rendering the
  // same markdown (streaming updates) reuses the same `Image` — same
  // `placementId`, which the KGP spec guarantees is a flicker-free
  // move/resize of the existing placement.
  readonly images = new Map<string, Image>()

  #renderer?: MarkdownRenderer
  #code = new Map<string, ShikiCode>()
  #update = signal(0)
  #worker: Accessor<number>

  constructor(state: State<MarkdownState>) {
    super(state)

    this.#worker = createAsync(
      async () => {
        const update = this.#update.get() // track
        const todo = [...this.#code.values()]
        if (!todo.length) return update // nothing to do, skip
        await Promise.all(
          todo.map(async (req) => {
            req.inflight ??= codeToAnsi(req.code, req.lang, req.theme)
            req.result = await req.inflight
          })
        )
        return update + 1
      },
      { initialValue: 0 }
    )
  }

  #highlight(code: string, lang?: string, theme?: ShikiTheme): string {
    if (!lang) return code
    const key = shikiWorker.key({ code, lang, theme })
    const ret = this.#code.get(key)
    if (ret?.result) return ret.result
    else if (!ret) this.#code.set(key, { code, key, lang, theme })
    return code
  }

  protected async _render(ctx: RenderCtx): Promise<string[]> {
    if (!this.#renderer) {
      const { MarkdownRenderer } = await import("../markdown/renderer.ts")
      this.#renderer = new MarkdownRenderer({ ...this.state.options, parent: this })
    }
    const source = unwrap(this.state.content) // tracked
    let formatted: string

    if (!hasColors) formatted = this.#renderer.normalizeEol(source, source)
    else {
      formatted = await this.#renderer.render(source, {
        ...ctx,
        highlight: (code, lang) => this.#highlight(code, lang, ctx.style.theme.shiki),
      })

      if (this.#code.values().some((c) => !c.inflight)) {
        this.#update.set(this.#update.get() + 1) // trigger worker
        this.#worker() // tracked
      } // trigger worker
    }

    return formatText(formatted, {
      indent: true,
      style: this.state.style ? ctx.style.add(this.state.style) : undefined,
      width: ctx.width,
      wrap: this.state.wrap,
      wrapBg: true,
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
