import type { Reactive } from "../core/reactive.ts"
import type { Theme } from "../themes/types.ts"
import type { TextStyle } from "./text.ts"

import { extname } from "pathe"
import { RenderContext } from "../core/ctx.ts"
import { createAsync, unwrap, useContext } from "../core/reactive.ts"
import { createAnsiHighlighter, isLang } from "../style/shiki.ts"
import { box } from "./box.ts"
import { text } from "./text.ts"
import { widget } from "./widget.ts"

export interface CodeState extends Omit<TextStyle, "content"> {
  /** Source to render. Plain string or reactive accessor — pass a
   *  signal for streaming bash output / tool results. */
  code: Reactive<string>
  /** Optional file path. Drives the default `lang` (extension) and
   *  `title` (path) when those aren't set explicitly. */
  path?: Reactive<string>
  /** Language for syntax highlighting (any shiki-bundled name or
   *  alias). Defaults to `extname(path).slice(1)` when `path` is set.
   *  Unknown langs fall through to plain rendering. */
  lang?: string
  /** Title line shown above the block. May contain ANSI. Defaults to
   *  `path` when set. */
  title?: Reactive<string>
  /** Disable syntax highlighting even if `lang` is set. Default: `true`. */
  syntax?: boolean
}

/**
 * Standalone code block: shiki-highlighted body inside a `code`-styled
 * shrink-to-content backdrop, optionally titled.
 *
 * Composition over custom layout — the backdrop is `box({ bg: "code",
 * width: "fit" })`, the body is plain `text(...)`. The active render
 * context (theme, style, width) is read via `useContext(RenderContext)`.
 *
 * Async highlighting flows through `createAsync`: signal reads inside
 * the async closure auto-track, so `props.code` (or any other reactive
 * source) drives a re-fire. The accessor returns `initialValue` (the
 * plain source) until shiki resolves, then swaps to the highlighted
 * version. On surfaces rendered with `ctx.async === false` (e.g. the
 * stream surface), the outermost `Node.render` drains pending
 * `createAsync` work before returning, so committed-to-scrollback rows
 * always reflect the resolved highlight.
 */
export const code = widget((props: CodeState) => {
  const initialPath = props.path === undefined ? undefined : unwrap(props.path)
  const langCandidate =
    props.lang ??
    (initialPath !== undefined ? extname(initialPath).slice(1).toLowerCase() : undefined)
  const syntax = props.syntax ?? true

  const body = createAsync(
    async () => {
      const source = unwrap(props.code) // tracks
      if (!syntax || langCandidate === undefined || langCandidate === "") return source
      const ctx = useContext(RenderContext)
      if (ctx === undefined) return source // pre-first-render
      return await highlightSource(source, langCandidate, ctx.theme)
    },
    { initialValue: unwrap(props.code) }
  )

  // Title is conditionally rendered — an always-present thunk that
  // returns "" still produces an empty row in the backdrop.
  const hasTitle = props.title !== undefined || initialPath !== undefined

  return box(
    { bg: "code", flexDirection: "column", padding: [0, 1], width: "fit" },
    hasTitle
      ? text(
          (ctx) => {
            const t = props.title !== undefined ? unwrap(props.title) : initialPath
            return t === undefined ? "" : ctx.style.codeTitle(t)
          },
          { wrap: "none" }
        )
      : undefined,
    text(body, { wrap: "none" })
  )
})

async function highlightSource(source: string, lang: string, theme: Theme): Promise<string> {
  if (!(await isLang(lang))) return source
  try {
    const highlighter = await createAnsiHighlighter({
      langs: [lang],
      theme: theme.shiki,
    })
    const out = highlighter(source.replace(/\n+$/, ""), lang)
    return out.replace(/\n+$/, "")
  } catch {
    return source
  }
}
