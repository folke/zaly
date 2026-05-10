import type { StyleBuilder } from "../core/ctx.ts"
import type { Reactive } from "../core/reactive.ts"
import type { State } from "../core/state.ts"
import type { AnyStyle } from "../style/types.ts"
import type { Theme } from "../themes/types.ts"

import { hasColors } from "@zaly/shared/env"
import { extname } from "pathe"
import { RenderContext } from "../core/ctx.ts"
import {
  createAsync,
  createRenderEffect,
  memo,
  signal,
  unwrap,
  useContext,
} from "../core/reactive.ts"
import { formatLines } from "../layout/text.ts"
import { createAnsiHighlighter, isLang } from "../style/shiki.ts"
import { box } from "./box.ts"
import { show } from "./show.ts"
import { text } from "./text.ts"
import { widget } from "./widget.ts"

export interface CodeState {
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
  style?: AnyStyle | false
  numbered?: boolean
  numberOffset?: Reactive<number | undefined>
  offset?: Reactive<number | undefined>
  limit?: Reactive<number | undefined>
  more?: (more: number, msg: string) => string
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
export const code = widget((props: State<CodeState>) => {
  const path = unwrap(props.path)
  const lang = props.lang ?? (path !== undefined ? extname(path).slice(1).toLowerCase() : undefined)
  const syntax = props.syntax ?? true

  // Theme is sourced from a render-time hook since the async closure
  // runs outside the render phase.
  const [style, setStyle] = signal<StyleBuilder | undefined>(undefined)
  createRenderEffect(() => {
    const ctx = useContext(RenderContext)
    if (ctx?.style) setStyle(() => ctx.style)
  })

  const title = memo(() => unwrap(props.title) ?? path)
  const body = createAsync(
    async () => {
      const source = unwrap(props.code) // tracked
      if (!hasColors) return source
      const t = style()?.theme
      if (!syntax || !lang || t === undefined) return source
      return highlightSource(source, lang, t)
    },
    { initialValue: unwrap(props.code) }
  )

  const formatted = memo(() =>
    formatLines(body(), {
      limit: unwrap(props.limit),
      more: props.more,
      numberOffset: unwrap(props.numberOffset),
      numbered: props.numbered,
      offset: unwrap(props.offset),
      style: style()?.gutter,
    }).join("\n")
  )

  return box(
    {
      flexDirection: "column",
      padding: props.style === false ? undefined : [0, 1],
      style: props.style === false ? undefined : (props.style ?? "code"),
      width: "fit",
    },
    show(
      { when: title },
      text((ctx) => ctx.style.codeTitle(title() ?? ""), { wrap: "none" })
    ),
    text(formatted, { wrap: "none" })
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
