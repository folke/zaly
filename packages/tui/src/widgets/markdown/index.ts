import type { RenderCtx } from "../../core/ctx.ts"
import type { MdCallbacks, MdOptions } from "../../markdown/index.ts"
import type { AnsiHighlighter } from "../../style/shiki.ts"
import type { Image } from "../image.ts"
import type { TextStyle } from "../text.ts"

import { Node } from "../../core/node.ts"
import { hyperlink, stringWidth } from "../../style/ansi.ts"
import { renderMarkdown } from "../../markdown/index.ts"
import { createAnsiHighlighter } from "../../style/shiki.ts"
import { Text } from "../text.ts"
import { collectFenceLanguages, createCodeCallback } from "./code.ts"
import { createImageCallback } from "./image.ts"
import { createTableCallbacks } from "./table.ts"

export interface MarkdownState extends TextStyle {
  content: string
  /** Options forwarded to `renderMarkdown`. */
  options?: MdOptions
  /**
   * Enable shiki-backed syntax highlighting for fenced code blocks. Defaults
   * to `true` — code blocks get per-token colors from the shiki theme, with
   * `mdCodeBlock`'s bg applied as a backdrop. Unknown languages fall through
   * as plain text.
   */
  syntax?: boolean
}

const icons = {
  bullets: ["●", "○", "◆", "◇"],
  checkbox: {
    checked: "[x]",
    unchecked: "[ ]",
  },
  hr: "─",
  quote: "│",
} as const

export class Markdown extends Node<MarkdownState> {
  // Image nodes cached per-src per-Markdown-instance. Re-rendering the
  // same markdown (streaming updates) reuses the same `Image` — same
  // `placementId`, which the KGP spec guarantees is a flicker-free
  // move/resize of the existing placement.
  readonly #images = new Map<string, Image>()
  #text: Text

  constructor(state: MarkdownState) {
    super(state)
    this.#text = new Text({ ...state, content: "" })
    this.add(this.#text)
  }

  protected async _render(ctx: RenderCtx): Promise<string[]> {
    const fn = this.state.options?.render ?? renderMarkdown
    const syntax = this.state.syntax ?? true

    // Pre-load any fenced-block languages we see in the source. Once this
    // resolves, the code callback (sync) can call `codeToAnsi` safely —
    // `createAnsiHighlighter` is idempotent + returns the shared singleton.
    let highlighter: AnsiHighlighter | undefined
    if (syntax) {
      const langs = collectFenceLanguages(this.state.content)
      highlighter = await createAnsiHighlighter({ langs, theme: ctx.theme.shiki })
    }

    // Image handling: the callback emits `<img id=N>` markers during
    // rendering; a post-processing resolver then renders the referenced
    // images concurrently and splices their rows back in. Keeps the
    // markdown callback surface synchronous while supporting async
    // image preparation.
    const imageCb = createImageCallback(this, this.#images)

    const callbacks: MdCallbacks = {
      ...mdCallbacks(ctx, { highlighter }),
      image: imageCb.image,
    }
    const rendered = fn(this.state.content, callbacks, this.state.options)
    const final = await imageCb.resolve(ctx, rendered)

    this.#text.setState({
      ...this.omitFromState("options", "syntax"),
      content: final.replace(/\n+$/, "\n"),
    })
    return this.#text.render(ctx)
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
export function markdown(content: string, style?: Omit<MarkdownState, "content">): Markdown
export function markdown(state: MarkdownState): Markdown
export function markdown(
  first: string | MarkdownState,
  style?: Omit<MarkdownState, "content">
): Markdown {
  if (typeof first === "string") return new Markdown({ content: first, ...style })
  return new Markdown(first)
}

export interface MdCallbacksOpts {
  /**
   * Optional shiki-backed highlighter. When supplied, code blocks are
   * syntax-coloured via `codeToAnsi` and `mdCodeBlock` is applied as a
   * bg-only backdrop so token fgs show through. The highlighter must be
   * pre-loaded with any languages the callbacks will be invoked on —
   * `Markdown._render` handles this via `createAnsiHighlighter` before
   * dispatching.
   */
  highlighter?: AnsiHighlighter
}

/**
 * Build the `MdCallbacks` that drive the theme-aware rendering. Exposed so
 * callers can invoke `renderMarkdown` directly when they need the string
 * output without the wrapping `Markdown` node (e.g. to embed markdown inside
 * a custom `Text` content function).
 * @internal
 */
export function mdCallbacks(ctx: RenderCtx, opts?: MdCallbacksOpts): MdCallbacks {
  const { style, theme } = ctx

  return {
    blockquote: (children) => {
      // Inner blocks (typically a paragraph) end with trailing newlines; if
      // we prefix those empty lines with "│ " they render as styled empty
      // rows between the last line of the quote and the block separator.
      // Trim first so the quote stops cleanly.
      const prefixed = children
        .replace(/\n+$/, "")
        .split("\n")
        .map((line) => style.mdQuote(`${icons.quote} ${line}`))
        .join("\n")
      return `${prefixed}\n\n`
    },

    code: createCodeCallback({ ctx, highlighter: opts?.highlighter }),

    codespan: (text) => style.mdCode(text),

    emphasis: (children) => style.mdItalic(children),

    heading: (children, { level }) => {
      // Try the level-specific slot; fall back to the generic `mdHeading`
      // when the theme doesn't define one. This lets themes opt into a
      // uniform heading look without repeating six entries.
      const levelSlot = `mdHeading${level}`
      const styleName =
        (theme as Record<string, unknown>)[levelSlot] !== undefined ? levelSlot : "mdHeading"
      // Pad each heading line to the full width so any background color
      // the theme sets extends edge-to-edge, giving headings a filled-bar
      // look rather than only covering the text cells.
      const width = ctx.width
      const padded = children
        .split("\n")
        .map((line) => line + " ".repeat(Math.max(0, width - stringWidth(line))))
        .join("\n")
      return `${style.add(styleName)(padded)}\n\n`
    },

    hr: () => `${style.mdHr(icons.hr.repeat(ctx.width))}\n\n`,

    html: (children) => children,

    link: (children, { href }) => hyperlink(href, style.mdLink(children)),

    list: (children, meta) => {
      // Nested lists need a leading newline so they break from their parent
      // item's inline text content instead of running on the same line.
      if (meta.depth === 0) return `${children}\n`
      return `\n${children}`
    },

    listItem: (children, meta) => {
      let marker = style.mdListBullet(
        meta.ordered
          ? `${(meta.start ?? 1) + meta.index}.`
          : icons.bullets[meta.depth % icons.bullets.length]
      )

      const indent = "  ".repeat(meta.depth)
      if (meta.checked !== undefined) {
        const ref = meta.checked ? "mdListChecked" : "mdListUnchecked"
        marker += ` ${style.add(ref)(meta.checked ? "[x]" : "[ ]")}`
      }
      // Children of a list item end with "\n" from their paragraph wrapper;
      // trim to keep rows tight.
      return `${indent}${marker} ${children.replace(/\n+$/, "")}\n`
    },

    paragraph: (children) => `${children}\n\n`,

    strikethrough: (children) => style.mdStrikethrough(children),

    strong: (children) => style.mdBold(children),

    ...createTableCallbacks(ctx),
  }
}
