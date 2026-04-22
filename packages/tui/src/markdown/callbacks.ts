import type { RenderCtx } from "../core/ctx.ts"
import type { AnsiHighlighter } from "../style/shiki.ts"
import type { MdCallbacks } from "./types.ts"

import { hyperlink, stringWidth } from "../style/ansi.ts"
import { createCodeCallback } from "./code.ts"
import { createTableCallbacks } from "./table.ts"

const icons = {
  bullets: ["●", "○", "◆", "◇"],
  checkbox: {
    checked: "[x]",
    unchecked: "[ ]",
  },
  hr: "─",
  quote: "│",
} as const

export type MarkdownCtx = RenderCtx & {
  highlighter?: AnsiHighlighter
}

/**
 * Build the `MdCallbacks` that drive the theme-aware rendering. Exposed so
 * callers can invoke `renderMarkdown` directly when they need the string
 * output without the wrapping `Markdown` node (e.g. to embed markdown inside
 * a custom `Text` content function).
 * @internal
 */
export function createCallbacks(ctx: MarkdownCtx): MdCallbacks {
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

    list: (children, meta) => {
      // Nested lists need a leading newline so they break from their parent
      // item's inline text content instead of running on the same line.
      if (meta.depth === 0) return `${children}\n`
      return `\n${children}`
    },

    listItem: (children, meta) => {
      let marker = s.mdListBullet(
        meta.ordered
          ? `${(meta.start ?? 1) + meta.index}.`
          : icons.bullets[meta.depth % icons.bullets.length]
      )

      const indent = "  ".repeat(meta.depth)
      if (meta.checked !== undefined) {
        const ref = meta.checked ? "mdListChecked" : "mdListUnchecked"
        marker += ` ${s.add(ref)(meta.checked ? "[x]" : "[ ]")}`
      }
      // Children of a list item end with "\n" from their paragraph wrapper;
      // trim to keep rows tight.
      return `${indent}${marker} ${children.replace(/\n+$/, "")}\n`
    },

    paragraph: (children) => `${children}\n\n`,

    strikethrough: (children) => s.mdStrikethrough(children),

    strong: (children) => s.mdBold(children),

    ...createTableCallbacks(ctx),
  }
}
