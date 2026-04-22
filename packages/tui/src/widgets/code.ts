import type { RenderCtx } from "../core/ctx.ts"
import type { AnsiHighlighter } from "../style/shiki.ts"
import type { TextStyle } from "./text.ts"

import { Node } from "../core/node.ts"
import { splitAnsi, stringWidth } from "../style/ansi.ts"
import { createAnsiHighlighter } from "../style/shiki.ts"
import { Text } from "./text.ts"

export interface CodeState extends Omit<TextStyle, "content"> {
  /** Source to render. */
  code: string
  /** Language for syntax highlighting (any shiki-bundled name). Omit or
   *  set to an unknown lang to render plain. */
  lang?: string
  /** Title line shown above the block. May contain ANSI. */
  title?: string
  /** Disable syntax highlighting even if `lang` is set. Default: `true`. */
  syntax?: boolean
}

/**
 * Standalone code block: shiki-highlighted body with an optional ANSI title.
 *
 * Uses the same padding/backdrop mechanics as markdown fenced blocks
 * (`mdCodeBlock`/`mdCodeBlockTitle`), but via the theme-level `code` and
 * `codeTitle` slots when available, and independently from any markdown
 * surround.
 */
export class Code extends Node<CodeState> {
  #text: Text

  constructor(state: CodeState) {
    super(state)
    this.#text = new Text({ ...state, content: "" })
    this.add(this.#text)
  }

  protected async _render(ctx: RenderCtx): Promise<string[]> {
    const content = await buildCodeContent(ctx, this.state)
    this.#text.setState({
      ...this.omitFromState("code", "lang", "title", "syntax"),
      content,
    })
    return this.#text.render(ctx)
  }
}

/**
 * Factory for `Code`.
 *
 * ```ts
 * code({ code: "const x = 1", lang: "ts" })
 * code({ code: "SELECT 1", lang: "sql", title: style.dim("query.sql") })
 * ```
 */
export function code(state: CodeState): Code {
  return new Code(state)
}

/**
 * Build the rendered content string for a code block. Extracted so the
 * `Diff` widget can reuse it — `Diff` pre-assembles rows with `-`/`+`
 * prefixes + per-row bg and hands the resulting pre-highlighted string
 * to us with `syntax: false` to skip re-highlighting.
 *
 * @internal
 */
export async function buildCodeContent(
  ctx: RenderCtx,
  state: Pick<CodeState, "code" | "lang" | "title" | "syntax">
): Promise<string> {
  const syntax = state.syntax ?? true

  let highlighter: AnsiHighlighter | undefined
  if (syntax && state.lang !== undefined && state.lang !== "") {
    highlighter = await createAnsiHighlighter({
      langs: [state.lang],
      theme: ctx.theme.shiki,
    })
  }

  const highlighted = tryHighlight(highlighter, state.code, state.lang)
  const body = highlighted ?? state.code.replace(/\n+$/, "")
  const lines = splitAnsi(body)
  const width = Math.min(ctx.width, Math.max(...lines.map(stringWidth), 0) + 1)
  const padded = lines.map((line) => {
    const pad = Math.max(0, width - stringWidth(line))
    const row = line + " ".repeat(pad)
    return ctx.style.code(row)
  })

  const titleLine = renderTitle(ctx, state.title)
  return titleLine + padded.join("\n")
}

function renderTitle(ctx: RenderCtx, title: string | undefined): string {
  return title === undefined ? "" : `${ctx.style.codeTitle(title)}\n`
}

function tryHighlight(
  highlighter: AnsiHighlighter | undefined,
  text: string,
  lang: string | undefined
): string | undefined {
  if (highlighter === undefined || lang === undefined || lang === "") return undefined
  try {
    const input = text.replace(/\n+$/, "")
    const out = highlighter(input, lang)
    if (out === input || out.trim() === input.trim()) return undefined
    return out.replace(/\n+$/, "")
  } catch {
    return undefined
  }
}
