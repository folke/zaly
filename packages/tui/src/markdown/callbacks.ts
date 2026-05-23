import type { RenderCtx } from "../core/ctx.ts"
import type { AnsiHighlighter } from "../style/shiki.ts"
import type { MdCallbacks } from "./types.ts"

import { stringWidth } from "@zaly/shared/ansi"
import { hyperlink } from "../style/ansi.ts"
import { createCodeCallback } from "./code.ts"
import { createListCallbacks } from "./list.ts"
import { createTableCallbacks } from "./table.ts"

const icons = {
  hr: "─",
  quote: "│",
} as const

export type MarkdownCbCtx = RenderCtx & {
  highlighter?: AnsiHighlighter
}

/**
 * Build the `MdCallbacks` that drive the theme-aware rendering. Exposed so
 * callers can invoke `renderMarkdown` directly when they need the string
 * output without the wrapping `Markdown` node (e.g. to embed markdown inside
 * a custom `Text` content function).
 * @internal
 */
export function createCallbacks(ctx: MarkdownCbCtx): MdCallbacks {
  const s = ctx.style

  return {
    blockquote: (children) => {
      // Inner blocks (typically a paragraph) end with trailing newlines; if
      // we prefix those empty lines with "│ " they render as styled empty
      // rows between the last line of the quote and the block separator.
      // Trim first so the quote stops cleanly.
      const prefixed = children
        .replace(/\n+$/, "")
        .split("\n")
        .map((line) => s.mdQuote(`${icons.quote} ${line}`))
        .join("\n")
      return `${prefixed}\n\n`
    },

    code: createCodeCallback(ctx),

    codespan: (text) => s.mdCode(text),

    emphasis: (children) => s.mdItalic(children),

    heading: (children, { level }) => {
      const width = ctx.width
      const padded = children
        .split("\n")
        .map((line) => line + " ".repeat(Math.max(0, width - stringWidth(line))))
        .join("\n")
      return `${s.add(`mdHeading${level}`)(padded)}\n\n`
    },

    hr: () => `${s.mdHr(icons.hr.repeat(ctx.width))}\n\n`,

    html: (children) => children,

    link: (children, { href }) => hyperlink(href, s.mdLink(children)),

    paragraph: (children) => `${children}\n\n`,

    strikethrough: (children) => s.mdStrikethrough(children),

    strong: (children) => s.mdBold(children),

    ...createListCallbacks(ctx),
    ...createTableCallbacks(ctx),
  }
}
