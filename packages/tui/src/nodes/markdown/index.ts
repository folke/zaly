import type { RenderCtx } from "../../core/ctx.ts"
import type { Size } from "../../layout/size.ts"
import type { MdCallbacks, MdOptions } from "../../md.ts"
import type { Style } from "../../style/ansi.ts"
import type { AnsiHighlighter, ShikiTheme } from "../../style/shiki.ts"

import { renderMarkdown, stringWidth } from "#runtime"
import { NodeBase } from "../../core/node.ts"
import { encodeFenceInfoStrings } from "../../md.ts"
import { hyperlink } from "../../style/ansi.ts"
import { createAnsiHighlighter } from "../../style/shiki.ts"
import { Text } from "../text.ts"
import { collectFenceLanguages, createCodeCallback, decodeCodeMeta } from "./code.ts"
import { createTableCallbacks } from "./table.ts"

export interface MarkdownStyle extends Style {
  wrap?: "word" | "char" | "none"
  width?: Size
}

export interface MarkdownState extends MarkdownStyle {
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
  /**
   * Shiki theme name used when `syntax` is enabled. Defaults to
   * `"tokyo-night"` (matches the zaly default). Any bundled shiki theme
   * name is accepted.
   */
  shikiTheme?: ShikiTheme
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

export class Markdown extends NodeBase<MarkdownState> {
  protected async _render(ctx: RenderCtx): Promise<string[]> {
    const fn = this.state.options?.render ?? renderMarkdown
    const syntax = this.state.syntax ?? true

    // Pre-load any fenced-block languages we see in the source. Once this
    // resolves, the code callback (sync) can call `codeToAnsi` safely —
    // `createAnsiHighlighter` is idempotent + returns the shared singleton.
    let highlighter: AnsiHighlighter | undefined
    if (syntax) {
      const langs = collectFenceLanguages(this.state.content)
      highlighter = await createAnsiHighlighter({ langs, theme: this.state.shikiTheme })
    }

    // Encode spaces in fence info-strings so renderers that truncate after
    // the first token (Bun) still surface `title="..."` etc. as part of
    // `meta.language`. The wrapper around `code` below re-parses to decode.
    const source = encodeFenceInfoStrings(this.state.content)
    const base = mdCallbacks(ctx, { highlighter })
    const callbacks: MdCallbacks = {
      ...base,
      code: (text, meta) => base.code?.(text, decodeCodeMeta(meta)) ?? text,
    }
    const rendered = fn(source, callbacks, this.state.options)
    const { content: _c, options: _o, shikiTheme: _st, syntax: _sy, ...styleOnly } = this.state
    const t = new Text({ content: rendered, wrap: "word", ...styleOnly })
    t.parent = this
    return t.render(ctx)
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
export function markdown(content: string, style?: MarkdownStyle): Markdown
export function markdown(state: MarkdownState): Markdown
export function markdown(first: string | MarkdownState, style?: MarkdownStyle): Markdown {
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
        .map((line) => style.mdBlockquote(`${icons.quote} ${line}`))
        .join("\n")
      return `${prefixed}\n\n`
    },

    code: createCodeCallback({ ctx, highlighter: opts?.highlighter }),

    codespan: (text) => style.mdCode(text),

    emphasis: (children) => style.mdEmphasis(children),

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
      let marker = style.mdList(
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

    strong: (children) => style.mdStrong(children),

    ...createTableCallbacks(ctx),
  }
}
