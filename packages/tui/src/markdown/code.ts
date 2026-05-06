import type { AnsiHighlighter, ShikiTheme } from "../style/shiki.ts"
import type { MarkdownCtx } from "./callbacks.ts"
import type { MdCallbacks } from "./types.ts"

import { splitAnsi, stringWidth } from "../style/ansi.ts"

export async function createCodeHighlighter(content: string, theme?: ShikiTheme) {
  const langs = collectFenceLanguages(content).filter(Boolean)
  // Only load when needed
  if (langs.length > 0) {
    const { createAnsiHighlighter } = await import("../style/shiki.ts")
    return await createAnsiHighlighter({ langs, theme })
  }
  return undefined
}

/**
 * Build the `code` callback. The returned closure captures ctx/style/highlighter
 * and renders each fenced block: syntax-highlight (if available), pad lines to
 * widest-content + 1, apply `mdCodeBlock` as a bg-only backdrop, and prefix an
 * optional title line from `title="..."`.
 */
export function createCodeCallback(ctx: MarkdownCtx): NonNullable<MdCallbacks["code"]> {
  // Pre-load any fenced-block languages we see in the source. Once this
  // resolves, the code callback (sync) can call `codeToAnsi` safely —
  // `createAnsiHighlighter` is idempotent + returns the shared singleton.
  const s = ctx.style
  return (text, meta) => {
    // Try syntax highlighting when a highlighter is wired in and the
    // language is already loaded on it. shiki's sync path requires the
    // grammar + theme to be preloaded — callers do that via
    // `createAnsiHighlighter({ langs, themes })` before rendering.
    const highlighted = ctx.highlighter
      ? tryHighlight(ctx.highlighter, text, meta?.language)
      : undefined
    const body = highlighted ?? text.replace(/\n+$/, "")

    // For highlighted output the per-token fgs would clash with the slot's
    // fg; override fg with `"inherit"` so only bg + attrs wrap each row
    // and shiki's per-token colors show through on top of the backdrop.
    const wrap = highlighted === undefined ? s.mdCodeBlock : s.mdCodeBlock.fg("inherit")
    const lines = splitAnsi(body)
    const width = Math.min(ctx.width, Math.max(...lines.map(stringWidth)) + 1)
    const padded = lines.map((line) => {
      const padding = Math.max(0, width - stringWidth(line) - 1)
      return wrap(` ${line}${" ".repeat(padding)}`)
    })
    const titleLine = meta?.title === undefined ? "" : `${s.mdCodeBlockTitle(meta.title)}\n`
    return `${titleLine}${padded.join("\n")}\n\n`
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

/**
 * Collect all fenced-block languages from a markdown source. First
 * whitespace-delimited token of each info-string is the language; duplicates
 * are deduped. Unknown-to-shiki names pass through and get filtered out by
 * `createAnsiHighlighter`.
 */
function collectFenceLanguages(md: string): string[] {
  const langs = new Set<string>()
  for (const m of md.matchAll(/^ {0,3}`{3,}([^\n]+)$/gm)) {
    const lang = m[1].trim().split(/\s/)[0]
    if (lang !== "") langs.add(lang)
  }
  return [...langs]
}
