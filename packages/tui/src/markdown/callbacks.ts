import type { AnyStyle } from "../style/types.ts"
import type { MarkdownCtx } from "./renderer.ts"
import type { MdCallbacks } from "./types.ts"

import { stringWidth } from "@zaly/shared/ansi"
import { capitalize } from "../layout/text.ts"
import { hyperlink } from "../style/ansi.ts"
import { createCodeCallback } from "./code.ts"
import { createListCallbacks } from "./list.ts"
import { createTableCallbacks } from "./table.ts"

const icons = {
  hr: "─",
  quote: "┃",
} as const

type AlertType = "NOTE" | "TIP" | "WARNING" | "IMPORTANT" | "CAUTION"
const alerts: Record<AlertType, { icon: string; style: AnyStyle }> = {
  CAUTION: { icon: "✖ ", style: "error" },
  IMPORTANT: { icon: "‼", style: "syntaxConstant" },
  NOTE: { icon: "ℹ ", style: "info" },
  TIP: { icon: "🛈 ", style: "success" },
  WARNING: { icon: "⚠", style: "warn" },
}

const alertRe = /^\s*\[!(NOTE|TIP|WARNING|IMPORTANT|CAUTION)\]\s*$/

/**
 * Build the `MdCallbacks` that drive the theme-aware rendering. Exposed so
 * callers can invoke `renderMarkdown` directly when they need the string
 * output without the wrapping `Markdown` node (e.g. to embed markdown inside
 * a custom `Text` content function).
 * @internal
 */
export function createCallbacks(ctx: MarkdownCtx, linkPrefix = crypto.randomUUID()): MdCallbacks {
  const s = ctx.style
  let linkSeq = 0

  return {
    blockquote: (children) => {
      const lines = children.replace(/\n+$/, "").split("\n")
      let lineStyle: AnyStyle = "mdQuote"

      const m = lines.length >= 1 ? lines[0].match(alertRe) : undefined
      if (m) {
        const alertType = m[1] as AlertType
        const alert = alerts[alertType]
        lineStyle = alert.style
        const name = capitalize(alertType.toLowerCase())
        lines[0] = s.add(lineStyle)(`${alert.icon} ${name}`)
      }

      // Inner blocks (typically a paragraph) end with trailing newlines; if
      // we prefix those empty lines with "│ " they render as styled empty
      // rows between the last line of the quote and the block separator.
      // Trim first so the quote stops cleanly.
      const prefixed = lines.map((line) => `${s.add(lineStyle)(icons.quote)} ${line}`).join("\n")
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

    link: (children, { href }) =>
      hyperlink(href, s.mdLink(children), `${linkPrefix}-${++linkSeq}`),

    paragraph: (children) => `${children}\n\n`,

    strikethrough: (children) => s.mdStrikethrough(children),

    strong: (children) => s.mdBold(children),

    ...createListCallbacks(ctx),
    ...createTableCallbacks(ctx),
  }
}
