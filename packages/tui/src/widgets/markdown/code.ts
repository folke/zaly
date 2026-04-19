import type { RenderCtx } from "../../core/ctx.ts"
import type { MdCallbacks } from "../../style/md/marked.ts"
import type { MdCodeBlockMeta } from "../../style/md/utils.ts"
import type { Style } from "../../style/ansi.ts"
import type { AnsiHighlighter } from "../../style/shiki.ts"

import { stringWidth } from "#runtime"
import { parseCodeInfoString } from "../../style/md/utils.ts"
import { openStyle, RESET, splitAnsi } from "../../style/ansi.ts"
import { reapplyBg, resolveStyle } from "../../style/compose.ts"

/**
 * Collect all fenced-block languages from a markdown source. First
 * whitespace-delimited token of each info-string is the language; duplicates
 * are deduped. Unknown-to-shiki names pass through and get filtered out by
 * `createAnsiHighlighter`.
 */
export function collectFenceLanguages(md: string): string[] {
  const langs = new Set<string>()
  for (const m of md.matchAll(/^ {0,3}`{3,}([^\n]+)$/gm)) {
    const lang = m[1].trim().split(/\s/)[0]
    if (lang !== "") langs.add(lang)
  }
  return [...langs]
}

/**
 * Normalize a code-block meta coming from either the marked-backed renderer
 * (already parsed, title populated) or Bun's renderer (only `language` set,
 * carrying the encoded info-string). Safe to call on either shape.
 */
export function decodeCodeMeta(meta: MdCodeBlockMeta | undefined): MdCodeBlockMeta | undefined {
  if (meta === undefined) return undefined
  if (meta.title !== undefined) return meta
  if (meta.language === undefined) return meta
  return parseCodeInfoString(meta.language) ?? meta
}

interface CodeCallbackOpts {
  ctx: RenderCtx
  highlighter: AnsiHighlighter | undefined
}

/**
 * Build the `code` callback. The returned closure captures ctx/style/highlighter
 * and renders each fenced block: syntax-highlight (if available), pad lines to
 * widest-content + 1, apply `mdCodeBlock` as a bg-only backdrop, and prefix an
 * optional title line from `title="..."`.
 */
export function createCodeCallback({
  ctx,
  highlighter,
}: CodeCallbackOpts): NonNullable<MdCallbacks["code"]> {
  const { style, theme } = ctx
  return (text, meta) => {
    // Try syntax highlighting when a highlighter is wired in and the
    // language is already loaded on it. shiki's sync path requires the
    // grammar + theme to be preloaded — callers do that via
    // `createAnsiHighlighter({ langs, themes })` before rendering.
    const highlighted = tryHighlight({ highlighter, lang: meta?.language, text })
    const body = highlighted ?? text.replace(/\n+$/, "")

    const blockStyle = resolveStyle("mdCodeBlock", theme)
    // For highlighted output the per-token fgs would clash with the slot's
    // fg; keep only bg + attrs so shiki's colors show through on top of a
    // consistent backdrop.
    const backdropStyle: Style =
      highlighted !== undefined && typeof blockStyle === "object"
        ? { ...blockStyle, fg: undefined }
        : blockStyle
    const open = openStyle(backdropStyle, theme)
    const lines = splitAnsi(body)
    const width = Math.min(ctx.width, Math.max(...lines.map(stringWidth)) + 1)
    const padded = lines.map((line) => {
      const padding = Math.max(0, width - stringWidth(line))
      const bodyLine = line + " ".repeat(padding)
      if (open === "") return bodyLine
      // reapplyBg re-opens the backdrop after every inner RESET so the
      // bg survives per-token resets emitted by shiki.
      return open + reapplyBg(bodyLine, open) + RESET
    })
    const titleLine = meta?.title === undefined ? "" : `${style.mdCodeBlockTitle(meta.title)}\n`
    return `${titleLine}${padded.join("\n")}\n\n`
  }
}

interface TryHighlightOpts {
  highlighter: AnsiHighlighter | undefined
  text: string
  lang: string | undefined
}

/**
 * Run shiki on a code block. `codeToAnsi` is sync here because the
 * highlighter was pre-loaded with all needed languages in `_render`.
 * Unknown languages (or a throw) just fall through to plain styling.
 */
function tryHighlight({ highlighter, text, lang }: TryHighlightOpts): string | undefined {
  if (highlighter === undefined || lang === undefined || lang === "") return undefined
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
