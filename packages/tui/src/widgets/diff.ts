import type { RenderCtx } from "../core/ctx.ts"
import type { Accessor, Reactive } from "../core/reactive.ts"
import type { Layout, State } from "../core/state.ts"
import type { WrapMode } from "../layout/text.ts"

import { splitAnsi, stringWidth, wrapAnsi } from "@zaly/shared/ansi"
import { basename, extname } from "pathe"
// oxlint-disable no-nested-ternary
// oxlint-disable typescript/no-unnecessary-condition
import { Node } from "../core/node.ts"
import { createAsync, memo, unwrap } from "../core/reactive.ts"
import { calcLayout, countLines } from "../layout/text.ts"
import { codeToAnsi } from "../shiki/shiki.ts"

export interface DiffState {
  /** Pre-state file content. Plain string or reactive accessor —
   *  pass a signal to live-update the diff as either side changes. */
  original: Reactive<string>
  /** Post-state file content. The widget runs `diffLines` between
   *  `original` and `modified` and renders the resulting hunks. */
  modified: Reactive<string>
  /** Optional file path. Drives the default `lang` (extension or
   *  basename — shiki recognises both `.ts` and `Dockerfile`-style
   *  names) and `title` when those aren't set explicitly. */
  path?: Reactive<string>
  /** Language for syntax highlighting (any shiki-bundled name or
   *  alias). Defaults from `path` when set. */
  lang?: string
  /** Lines of surrounding context per hunk. Default: 3. */
  context?: number
  wrap?: WrapMode
}

type DiffOpts = {
  original: string[]
  originalHi: string[]
  modified: string[]
  modifiedHi: string[]
  context: number
  ctx: RenderCtx
}

/**
 * Show a unified diff between two file contents with syntax-highlighted
 * rows. Added rows carry a green backdrop and `+` prefix; removed rows
 * carry a red backdrop and `-` prefix; context rows show both line
 * numbers with a neutral gutter.
 *
 * Both sides are highlighted as complete files (via shiki) before the
 * diff is assembled, so context around an edit tokenizes the way it
 * would in the actual file — multi-line strings, block comments, etc.
 * don't get truncated by the hunk window.
 */
export class Diff extends Node<DiffState> {
  #lang: Accessor<string | undefined>
  #highlighted: Accessor<{ original: string; modified: string }>

  constructor(state: DiffState) {
    super({ wrap: "word", ...state })

    this.#lang = memo(() => {
      const path = unwrap(this.state.path)
      return this.state.lang ?? (path !== undefined ? langFromPath(path) : undefined)
    })

    this.#highlighted = createAsync(
      async () => {
        const lang = this.#lang()
        const input = this.input
        if (!lang) return input
        const [original, modified] = await Promise.all([
          codeToAnsi(input.original, lang),
          codeToAnsi(input.modified, lang),
        ])
        return { modified, original }
      },
      {
        initialValue: this.input,
      }
    )
  }

  #norm(s: string): string {
    return s.replaceAll("\r\n", "\n").replaceAll("\r", "")
  }

  get input(): { original: string; modified: string } {
    return {
      modified: this.#norm(unwrap(this.state.modified)),
      original: this.#norm(unwrap(this.state.original)),
    }
  }

  protected async _render(ctx: RenderCtx): Promise<string[]> {
    const highlighted = this.#highlighted()
    const input = this.input
    const layout = this.layout()
    const width = Math.min(ctx.width, layout.width)

    const opts: DiffOpts = {
      context: this.state.context ?? 3,
      ctx: { ...ctx, width },
      modified: input.modified.split("\n"),
      modifiedHi: highlighted.modified.split("\n"),
      original: input.original.split("\n"),
      originalHi: highlighted.original.split("\n"),
    }

    this.state.wrap ??= "word"
    return await buildDiffRows(opts)
  }

  override layout(): Layout {
    const input = this.input
    const original = calcLayout(input.original, { wrap: this.state.wrap })
    const modified = calcLayout(input.modified, { wrap: this.state.wrap })
    const numWidth = Math.max(
      1,
      countLines(unwrap(this.state.original)),
      countLines(unwrap(this.state.modified))
    ).toString().length
    const padding = numWidth * 2 + 4 + 4
    return {
      minWidth: Math.max(original.minWidth, modified.minWidth) + padding,
      width: Math.max(original.width, modified.width) + padding,
    }
  }
}

/**
 * Factory for `Diff`.
 *
 * ```ts
 * diff({
 *   original: "function foo() {}\n",
 *   modified: "function foo(x) {}\n",
 *   path: "foo.ts",
 * })
 * ```
 */
export function diff(state: State<DiffState>): Diff {
  return new Diff(state)
}

// ---------- internals ----------

type DiffRow =
  | { type: "context"; origNum: number; newNum: number; content: string }
  | { type: "remove"; origNum: number; content: string }
  | { type: "add"; newNum: number; content: string }

async function buildDiffRows(opts: DiffOpts): Promise<string[]> {
  const context = opts.context
  // Async-import keeps cold start snappy — only the diff widget pulls
  // in the library, and it lands at first render rather than at module
  // load.
  const { diffArrays } = await import("diff")
  const segments = diffArrays(opts.original, opts.modified)
  const {
    original: origLines,
    modified: modLines,
    originalHi: origHi,
    modifiedHi: modHi,
    ctx,
  } = opts

  // Annotate each line in the diff with its kind + (orig, mod) indices.
  // The flattened list is the row-order the diff would print without
  // any hunking; we compute hunks (with surrounding context) on top.
  interface Annotated {
    kind: "equal" | "remove" | "add"
    origIdx?: number
    modIdx?: number
  }
  const ann: Annotated[] = []
  let oI = 0
  let mI = 0
  for (const seg of segments) {
    if (seg.added) {
      for (const _ of seg.value) ann.push({ kind: "add", modIdx: mI++ })
    } else if (seg.removed) {
      for (const _ of seg.value) ann.push({ kind: "remove", origIdx: oI++ })
    } else {
      for (const _ of seg.value) ann.push({ kind: "equal", modIdx: mI++, origIdx: oI++ })
    }
  }

  // Find hunks: ranges around each non-equal line, expanded by `context`,
  // merged when adjacent ranges touch.
  const ranges: { start: number; end: number }[] = []
  for (let i = 0; i < ann.length; i++) {
    if (ann[i].kind === "equal") continue
    const start = Math.max(0, i - context)
    const end = Math.min(ann.length - 1, i + context)
    const last = ranges.at(-1)
    if (last && start <= last.end + 1) last.end = Math.max(last.end, end)
    else ranges.push({ end, start })
  }
  if (ranges.length === 0) return [] // nothing changed

  // Emit rows for each hunk. (Between hunks we just skip the equal
  // lines — a `…` divider is a future polish.)
  const rows: DiffRow[] = []
  for (const r of ranges) {
    for (let i = r.start; i <= r.end; i++) {
      const a = ann[i]
      if (a.kind === "equal") {
        rows.push({
          content: modHi[a.modIdx!] ?? origHi[a.origIdx!] ?? "",
          newNum: a.modIdx! + 1,
          origNum: a.origIdx! + 1,
          type: "context",
        })
      } else if (a.kind === "remove") {
        rows.push({
          content: origHi[a.origIdx!] ?? "",
          origNum: a.origIdx! + 1,
          type: "remove",
        })
      } else {
        rows.push({
          content: modHi[a.modIdx!] ?? "",
          newNum: a.modIdx! + 1,
          type: "add",
        })
      }
    }
  }

  return renderRows(ctx, rows, origLines.length, modLines.length)
}

function renderRows(
  ctx: RenderCtx,
  rows: DiffRow[],
  origTotal: number,
  modTotal: number
): string[] {
  const numWidth = Math.max(String(origTotal).length, String(modTotal).length, 1)
  const s = ctx.style

  // Two-column gutter: original line number | new line number | space.
  // - Context rows show both numbers.
  // - Remove rows show only the original number; new column blank.
  // - Add rows show only the new number; original column blank.
  // Wrapped continuation lines reuse the row style but emit a blank
  // gutter so the line number isn't repeated per visual row.
  const gutterWidth = numWidth * 2 + 4 // "<orig> <new> "
  const contentWidth = Math.max(0, ctx.width - gutterWidth)
  const blankGutter = " ".repeat(gutterWidth - 2) + s.dim("↪ ")

  const styles = {
    add: "diffAdd",
    context: "diffContext",
    remove: "diffDel",
  } as const

  const out: string[] = []
  for (const r of rows) {
    const origStr = r.type === "add" ? "" : String(r.origNum)
    const newStr = r.type === "remove" ? "" : String(r.newNum)
    const gutterStyle = s.bg(`${styles[r.type]}+10`)
    const gutter = gutterStyle(` ${pad(origStr, numWidth)}  ${pad(newStr, numWidth)} `)

    const prefix = r.type === "add" ? " + " : r.type === "remove" ? " - " : "   "
    const innerWidth = Math.max(0, contentWidth - stringWidth(prefix) - 1)

    // Hard-wrap the content. Char-wrap (vs. word-wrap) keeps code
    // diffs honest — splitting by word boundaries would shift columns
    // mid-line and make alignment confusing.
    const wrapped =
      innerWidth > 0 && stringWidth(r.content) > innerWidth
        ? splitAnsi(wrapAnsi(r.content, innerWidth, { mode: "word" }))
        : [r.content]

    const rowStyle = s.bg(styles[r.type])
    for (let i = 0; i < wrapped.length; i++) {
      const wline = wrapped[i]
      const pw = Math.max(0, innerWidth - stringWidth(wline) + 1)
      const bodyLine = (i === 0 ? prefix : "   ") + wline + " ".repeat(pw)
      const styledBody = rowStyle?.(bodyLine) ?? bodyLine
      out.push((i === 0 ? gutter : gutterStyle(blankGutter)) + styledBody)
    }
  }
  return out
}

function pad(s: string, width: number): string {
  return s.length >= width ? s : " ".repeat(width - s.length) + s
}

/** Resolve a file path to a shiki language identifier. Falls back from
 *  extension to basename — shiki natively recognises `dockerfile`,
 *  `makefile`, `cmakelists.txt`, etc. */
function langFromPath(path: string): string | undefined {
  const ext = extname(path).slice(1).toLowerCase()
  if (ext) return ext
  const base = basename(path).toLowerCase()
  return base || undefined
}
