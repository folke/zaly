import type { AnsiHighlighter } from "../style/shiki.ts"
import type { MarkdownCbCtx } from "./callbacks.ts"
import type { MdCallbacks } from "./types.ts"

import { stringWidth } from "@zaly/shared/ansi"

/**
 * Build the `code` callback. The returned closure captures ctx/style/highlighter
 * and renders each fenced block: syntax-highlight (if available), pad lines to
 * widest-content + 1, apply `mdCodeBlock` as a bg-only backdrop, and prefix an
 * optional title line from `title="..."`.
 */
export function createCodeCallback(ctx: MarkdownCbCtx): NonNullable<MdCallbacks["code"]> {
  const highlighter = ctx.highlighter

  const s = ctx.style
  return (text, meta) => {
    // Try syntax highlighting when a highlighter is wired in and the
    // language is already loaded on it. shiki's sync path requires the
    // grammar + theme to be preloaded — callers do that via
    // `createAnsiHighlighter({ langs, themes })` before rendering.
    const highlighted = highlighter ? tryHighlight(highlighter, text, meta?.language) : undefined
    const body = highlighted ?? text.replace(/\n+$/, "")

    // For highlighted output the per-token fgs would clash with the slot's
    // fg; override fg with `"inherit"` so only bg + attrs wrap each row
    // and shiki's per-token colors show through on top of the backdrop.
    const wrap = highlighted === undefined ? s.mdCodeBlock : s.mdCodeBlock.fg("inherit")
    const hpad = 2
    const lines = `\n${body}\n`.split("\n")
    const width = Math.max(...lines.map(stringWidth)) + hpad * 2
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

/**
 * Run shiki on a code block. `codeToAnsi` is sync here because the
 * highlighter was pre-loaded with all needed languages in `_render`.
 * Unknown languages (or a throw) just fall through to plain styling.
 */
function tryHighlight(
  highlighter: AnsiHighlighter,
  text: string,
  lang?: string
): string | undefined {
  if (lang === undefined || lang === "") return undefined
  try {
    // Shiki emits a trailing newline; strip it so the block hugs content.
    const code = text.replace(/\n+$/, "")
    const out = highlighter(code, lang)
    // If shiki couldn't match the lang it returns the input unchanged —
    // detect that and fall through to the plain path so mdCodeBlock fg+bg
    // still apply instead of leaving the code bare.
    if (out === code || out.trim() === code.trim()) return undefined
    return out.replace(/\n+$/, "")
  } catch {
    return undefined
  }
}
