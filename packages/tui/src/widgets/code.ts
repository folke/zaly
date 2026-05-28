import type { Reactive } from "../core/reactive.ts"
import type { State } from "../core/state.ts"
import type { AnyStyle } from "../style/types.ts"

import { extname } from "pathe"
import { RenderContext } from "../core/ctx.ts"
import { createAsync, memo, unwrap, useContext } from "../core/reactive.ts"
import { formatLines } from "../layout/text.ts"
import { codeToAnsi } from "../shiki/shiki.ts"
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
 * width: "fit" })`, the body is plain `text(...)`. Ambient theme/style
 * arrive via `useContext(RenderContext)`; the async closure reads
 * `style()?.theme` so it stays correct across theme swaps.
 *
 * Async highlighting flows through `createAsync`: signal reads inside
 * the async closure auto-track, so `props.code` (or any other reactive
 * source) drives a re-fire. The accessor returns `initialValue` (the
 * plain source) until shiki resolves, then swaps to the highlighted
 * version. When called inside a Stream surface's `append`, the surface
 * installs a `SuspenseContext` boundary; Stream awaits it before
 * painting, so rows committed to scrollback always reflect the
 * resolved highlight rather than the initial plain source.
 */
export const code = widget((props: State<CodeState>) => {
  const path = unwrap(props.path)
  const lang = props.lang ?? (path !== undefined ? extname(path).slice(1).toLowerCase() : undefined)
  const syntax = props.syntax ?? true

  // Theme is sourced from a render-time hook since the async closure
  // runs outside the render phase.

  const context = useContext(RenderContext)

  const title = memo(() => unwrap(props.title) ?? path)

  const plain = () => unwrap(props.code).replace(/\n+$/, "")

  const body = createAsync(
    async () => {
      const source = plain()
      if (!lang || !syntax) return source
      return await codeToAnsi(source, lang, context?.style().theme.shiki)
    },
    { initialValue: plain() }
  )

  const formatted = memo(() =>
    formatLines(body(), {
      limit: unwrap(props.limit),
      more: props.more,
      numberOffset: unwrap(props.numberOffset),
      numbered: props.numbered,
      offset: unwrap(props.offset),
      style: context?.style().gutter,
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
