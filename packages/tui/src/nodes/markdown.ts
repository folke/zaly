import type { RenderCtx } from "../core/ctx.ts"
import type { Size } from "../layout/size.ts"
import type { MdCallbacks, MdCodeBlockMeta, MdOptions } from "../md.ts"
import type { Style } from "../style/ansi.ts"

import { renderMarkdown, stringWidth } from "#runtime"
import { NodeBase } from "../core/node.ts"
import { encodeFenceInfoStrings, parseCodeInfoString } from "../md.ts"
import { hyperlink, openStyle, RESET, splitAnsi } from "../style/ansi.ts"
import { reapplyBg, resolveStyleSlot } from "../style/compose.ts"
import { Text } from "./text.ts"

export interface MarkdownStyle extends Style {
  wrap?: "word" | "char" | "none"
  width?: Size
}

export interface MarkdownState extends MarkdownStyle {
  content: string
  /** Options forwarded to `renderMarkdown`. */
  options?: MdOptions
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
  protected _render(ctx: RenderCtx): string[] {
    const fn = this.state.options?.render ?? renderMarkdown
    // Encode spaces in fence info-strings so renderers that truncate after
    // the first token (Bun) still surface `title="..."` etc. as part of
    // `meta.language`. The wrapper around `code` below re-parses to decode.
    const source = encodeFenceInfoStrings(this.state.content)
    const base = mdCallbacks(ctx)
    const callbacks: MdCallbacks = {
      ...base,
      code: (text, meta) => base.code?.(text, decodeCodeMeta(meta)) ?? text,
    }
    const rendered = fn(source, callbacks, this.state.options)
    const { content: _c, options: _o, ...styleOnly } = this.state
    const t = new Text({ content: rendered, wrap: "word", ...styleOnly })
    t.parent = this
    return t.render(ctx)
  }
}

/**
 * Normalize a code-block meta coming from either the marked-backed renderer
 * (already parsed, title populated) or Bun's renderer (only `language` set,
 * carrying the encoded info-string). Safe to call on either shape.
 */
function decodeCodeMeta(meta: MdCodeBlockMeta | undefined): MdCodeBlockMeta | undefined {
  if (meta === undefined) return undefined
  if (meta.title !== undefined) return meta
  if (meta.language === undefined) return meta
  return parseCodeInfoString(meta.language) ?? meta
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

/**
 * Build the `MdCallbacks` that drive the theme-aware rendering. Exposed so
 * callers can invoke `renderMarkdown` directly when they need the string
 * output without the wrapping `Markdown` node (e.g. to embed markdown inside
 * a custom `Text` content function).
 */
export function mdCallbacks(ctx: RenderCtx): MdCallbacks {
  const theme = ctx.theme

  const applyStyle = (s: string, styleObj: Style): string => {
    const open = openStyle(styleObj, theme)
    if (open === "") return s
    // Inner RESETs from nested spans would clobber the outer style. Re-apply
    // the outer open after each reset so it survives through to the real end.
    return open + reapplyBg(s, open) + RESET
  }

  const slotStyle = (name: string, s: string): string =>
    applyStyle(s, resolveStyleSlot(name, theme))

  return {
    blockquote: (children) => {
      // Inner blocks (typically a paragraph) end with trailing newlines; if
      // we prefix those empty lines with "│ " they render as styled empty
      // rows between the last line of the quote and the block separator.
      // Trim first so the quote stops cleanly.
      const prefixed = children
        .replace(/\n+$/, "")
        .split("\n")
        .map((line) => slotStyle("mdBlockquote", `${icons.quote} ${line}`))
        .join("\n")
      return `${prefixed}\n\n`
    },

    code: (text, meta) => {
      const style = resolveStyleSlot("mdCodeBlock", theme)
      const open = openStyle(style, theme)
      const lines = splitAnsi(text)
      const width = Math.min(ctx.width, Math.max(...lines.map(stringWidth)) + 1)
      const padded = lines.map((line) => {
        const padding = Math.max(0, width - stringWidth(line))
        const body = line + " ".repeat(padding)
        return open === "" ? body : open + body + RESET
      })
      const titleLine =
        meta?.title === undefined ? "" : `${slotStyle("mdCodeBlockTitle", meta.title)}\n`
      // lang meta (meta?.language) is parsed but unused in v1 — syntax
      // highlighting comes in a later pass.
      return `${titleLine}${padded.join("\n")}\n\n`
    },

    codespan: (text) => slotStyle("mdCode", text),

    emphasis: (children) => slotStyle("mdEmphasis", children),

    heading: (children, { level }) => {
      // Try the level-specific slot; fall back to the generic `mdHeading`
      // when the theme doesn't define one. This lets themes opt into a
      // uniform heading look without repeating six entries.
      const levelSlot = `mdHeading${level}`
      const hasLevel = (theme as Record<string, unknown>)[levelSlot] !== undefined
      const slotName = hasLevel ? levelSlot : "mdHeading"
      // Pad each heading line to the full width so any background color
      // the theme sets extends edge-to-edge, giving headings a filled-bar
      // look rather than only covering the text cells.
      const width = ctx.width
      const padded = children
        .split("\n")
        .map((line) => line + " ".repeat(Math.max(0, width - stringWidth(line))))
        .join("\n")
      return `${slotStyle(slotName, padded)}\n\n`
    },

    hr: () => `${slotStyle("mdHr", icons.hr.repeat(ctx.width))}\n\n`,

    html: (children) => children,

    link: (children, { href }) => hyperlink(href, slotStyle("mdLink", children)),

    list: (children, meta) => {
      // Nested lists need a leading newline so they break from their parent
      // item's inline text content instead of running on the same line.
      if (meta.depth === 0) return `${children}\n`
      return `\n${children}`
    },

    listItem: (children, meta) => {
      let marker = slotStyle(
        "mdList",
        meta.ordered
          ? `${(meta.start ?? 1) + meta.index}.`
          : icons.bullets[meta.depth % icons.bullets.length]
      )

      const indent = "  ".repeat(meta.depth)
      if (meta.checked !== undefined) {
        marker += " "
        marker += slotStyle(
          `mdList${meta.checked ? "Checked" : "Unchecked"}`,
          meta.checked ? "[x]" : "[ ]"
        )
      }
      // Children of a list item end with "\n" from their paragraph wrapper;
      // trim to keep rows tight.
      return `${indent}${marker} ${children.replace(/\n+$/, "")}\n`
    },

    paragraph: (children) => `${children}\n\n`,

    strikethrough: (children) => slotStyle("mdStrikethrough", children),

    strong: (children) => slotStyle("mdStrong", children),

    table: (children) => `${children}\n`,

    tbody: (children) => children,

    td: (children) => `${slotStyle("mdTable", "│")} ${children} `,

    th: (children) => `${slotStyle("mdTable", "│")} ${slotStyle("mdTableHeader", children)} `,

    thead: (children) => `${children}${slotStyle("mdTable", "│")}\n`,

    tr: (children) => `${children}${slotStyle("mdTable", "│")}\n`,
  }
}
