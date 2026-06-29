import type { MarkdownCtx } from "./renderer.ts"
import type { MdCallbacks } from "./types.ts"

import { stringWidth } from "@zaly/shared/ansi"
import { formatText } from "../layout/text.ts"

/**
 * Build the `code` callback. The returned closure captures ctx/style/highlighter
 * and renders each fenced block: syntax-highlight (if available), pad lines to
 * widest-content + 1, apply `mdCodeBlock` as a bg-only backdrop, and prefix an
 * optional title line from `title="..."`.
 */
export function createCodeCallback(ctx: MarkdownCtx): NonNullable<MdCallbacks["code"]> {
  const s = ctx.style
  return (text, meta) => {
    text = text.replace(/\n+$/, "") // trim to avoid extra blank lines after the block
    const highlighted = ctx.highlight?.(text, meta?.language) ?? text

    // For highlighted output the per-token fgs would clash with the slot's
    // fg; override fg with `"inherit"` so only bg + attrs wrap each row
    // and shiki's per-token colors show through on top of the backdrop.
    const wrap = highlighted === text ? s.mdCodeBlock : s.mdCodeBlock.fg("inherit")
    const hpad = 2
    const maxWidth = ctx.width
    const lines = formatText(`\n${highlighted}\n`, {
      width: maxWidth - hpad * 2,
      wrap: "word",
    })
    let width = Math.max(...lines.map(stringWidth)) + hpad * 2
    width = Math.min(width, maxWidth) // leave room for the border
    // Left-align with a fixed `hpad` of leading whitespace; pad the
    // right to fill the bg out to `width`. Centering would push short
    // lines toward the middle, which reads as visually misaligned code.
    // Lines wider than the available room (width − hpad) drop the
    // leading pad so the bg ends at the cap rather than overshooting.
    const padded = lines.map((line) => {
      const w = stringWidth(line)
      if (w >= width - hpad) return wrap(line)
      return wrap(`${" ".repeat(hpad)}${line}${" ".repeat(width - w - hpad)}`)
    })
    const titleLine = meta?.title === undefined ? "" : `${s.mdCodeBlockTitle(meta.title)}\n`
    // Leading `\n` guards against raw-text siblings that don't emit a
    // paragraph-wrap (e.g. some inline-only list items where the parser
    // drops the paragraph). Containers (`listItem`, document) collapse
    // `\n{3,}` → `\n\n` so paragraph + code doesn't double up.
    return `\n${titleLine}${padded.join("\n")}\n\n`
  }
}
