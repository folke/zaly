import type { RenderCtx } from "../core/ctx.ts"
import type { Accessor } from "../core/reactive.ts"
import type { State } from "../core/state.ts"
import type { WrapMode } from "../layout/text.ts"
import type { MarkdownRenderer } from "../markdown/renderer.ts"
import type { MdOptions } from "../markdown/types.ts"
import type { ShikiTheme } from "../shiki/types.ts"
import type { AnyStyle } from "../style/types.ts"
import type { Image } from "./image.ts"
import type { TextContent } from "./text.ts"

import { hasColors } from "@zaly/shared/env"
import { Node } from "../core/node.ts"
import { createAsync, signal } from "../core/reactive.ts"
import { calcLayout, expandTabs, formatText } from "../layout/text.ts"
import { shikiWorker } from "../shiki/client.ts"
import { codeToAnsi } from "../shiki/shiki.ts"
import { textContent } from "./text.ts"

export interface MarkdownState {
  /** Markdown source. Accepts a plain string or a reactive accessor —
   *  pass `signal()` / `memo()` for streaming content that re-parses on
   *  each render and subscribes the node to the signal. */
  content: TextContent
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
  ac?: AbortController
  result?: string
  gen: number
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
  #gen = 0
  #worker: Accessor<number>

  constructor(state: State<MarkdownState>) {
    super(state)

    this.#worker = createAsync(
      async () => {
        const update = this.#update.get() // track
        const todo = [...this.#code.values()].filter((c) => c.gen === this.#gen && !c.result)
        if (!todo.length) return update // nothing to do, skip
        await Promise.all(
          todo.map(async (req) => {
            req.ac ??= new AbortController()
            req.inflight ??= codeToAnsi(req.code, req.lang, {
              signal: req.ac.signal,
              theme: req.theme,
            })
            try {
              req.result = await req.inflight
            } catch (error) {
              if (req.ac.signal.aborted) {
                if (this.#code.get(req.key) === req) this.#code.delete(req.key)
              } else throw error
            }
          })
        )
        return update + 1
      },
      { initialValue: 0 }
    )
  }

  /** Find a highlighted result for a prefix of `code` in the cache. This
   * handles streaming updates where the full code block isn't available yet
   * and prevents flashing un-highlighted text on each update. */
  #streamingHighlight(code: string, lang: string, theme?: ShikiTheme) {
    let ret: ShikiCode | undefined
    for (const c of this.#code.values()) {
      if (!c.result || c.lang !== lang || c.theme !== theme) continue
      if (code.startsWith(c.code) && c.code.length > (ret?.code.length ?? 0)) ret = c
    }
    if (ret) ret.gen = this.#gen // bump gen to keep it alive in cache
    return ret?.result ? ret.result + code.slice(ret.code.length) : code
  }

  #highlight(code: string, lang?: string, theme?: ShikiTheme): string {
    if (!lang) return code
    const key = shikiWorker.key({ code, lang, theme })
    const ret = this.#code.get(key)
    if (ret) ret.gen = this.#gen // bump gen to keep it alive in cache
    if (ret?.result) return ret.result
    else if (!ret) this.#code.set(key, { code, gen: this.#gen, key, lang, theme })
    return this.#streamingHighlight(code, lang, theme)
  }

  protected async _render(ctx: RenderCtx): Promise<string[]> {
    if (!this.#renderer) {
      const { MarkdownRenderer } = await import("../markdown/renderer.ts")
      this.#renderer = new MarkdownRenderer({ ...this.state.options, parent: this })
    }
    let source = await textContent(this.state.content, ctx)
    source = expandTabs(source)
    let formatted: string

    if (!hasColors) formatted = this.#renderer.normalizeEol(source, source)
    else {
      this.#gen++ // bump generation to track what is still used

      formatted = await this.#renderer.render(source, {
        ...ctx,
        highlight: (code, lang) => this.#highlight(code, lang, ctx.style.theme.shiki),
      })

      // prune old entries
      for (const [k, c] of this.#code.entries())
        if (c.gen !== this.#gen) {
          c.ac?.abort()
          if (c.result !== undefined) this.#code.delete(k)
        }

      // Trigger the worker if needed
      if (this.#code.values().some((c) => !c.inflight)) {
        this.#update.set(this.#gen) // trigger worker
        this.#worker() // tracked
      }
    }

    return formatText(formatted, {
      indent: true,
      style: this.state.style ? ctx.style.add(this.state.style) : undefined,
      width: ctx.width,
      wrap: this.state.wrap,
      wrapBg: true,
    })
  }

  override async layout(ctx: RenderCtx) {
    return calcLayout(await textContent(this.state.content, ctx))
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
  content: TextContent,
  style?: Omit<State<MarkdownState>, "content">
): Markdown
export function markdown(state: State<MarkdownState>): Markdown
export function markdown(
  first: TextContent | MarkdownState,
  style?: Omit<State<MarkdownState>, "content">
): Markdown {
  // Plain strings and accessor functions go through the content path;
  // a non-function object is the full state form.
  if (typeof first === "string" || typeof first === "function") {
    return new Markdown({ content: first, ...style })
  }
  return new Markdown(first)
}
