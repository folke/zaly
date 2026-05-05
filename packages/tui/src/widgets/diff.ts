// oxlint-disable no-nested-ternary
// oxlint-disable typescript/no-unnecessary-condition
import type { RenderCtx } from "../core/ctx.ts"
import type { Reactive } from "../core/reactive.ts"
import type { TextStyle } from "./text.ts"

import { extname } from "pathe"
import { Node } from "../core/node.ts"
import { unwrap } from "../core/reactive.ts"
import { stringWidth } from "../style/ansi.ts"
import { createAnsiHighlighter } from "../style/shiki.ts"
import { box } from "./box.ts"
import { text } from "./text.ts"

/**
 * One edit, line-range based (matching the shape tools like `Edit` /
 * multi-edit actually emit once `old_string`/`new_string` have been
 * resolved to a location in the file).
 *
 * `from`/`to` reference line indices in `original`, half-open: lines
 * `[from, to)` are replaced by `replacement`. Pure insertion: `from === to`.
 * Pure deletion: `replacement.length === 0`.
 */
export interface DiffEdit {
  from: number
  to: number
  replacement: string[]
}

export interface DiffState extends Omit<TextStyle, "content"> {
  /** The complete original file content. Plain string or reactive
   *  accessor — pass a signal to live-update the diff as the original
   *  or in-flight edits change. Widget splits it by `\n` at render. */
  original: Reactive<string>
  /** Line-range edits, referencing indices in `original`. Reactive so
   *  the displayed hunks update as the agent's edit set evolves. */
  edits: Reactive<DiffEdit[]>
  /** Optional file path. Drives the default `lang` (extension) and
   *  `title` (path) when those aren't set explicitly. */
  path?: Reactive<string>
  /** Language for syntax highlighting (any shiki-bundled name or
   *  alias). Defaults to `extname(path).slice(1)` when `path` is set. */
  lang?: string
  /** File path or other title shown at the top. May contain ANSI.
   *  Defaults to `path` when set. */
  title?: Reactive<string>
  /** Lines of surrounding context per hunk. Default: 3. */
  context?: number
}

/**
 * Show a set of line-range edits against an original file as a unified
 * diff with syntax-highlighted content. Added rows carry a green backdrop
 * and a `+` prefix; removed rows carry a red backdrop and a `-` prefix;
 * context rows show both line numbers with a neutral gutter.
 *
 * Both sides are highlighted as complete files (via shiki) before the
 * diff is assembled, so context around an edit tokenizes the way it
 * would in the actual file — multi-line strings, block comments, and
 * so on don't get truncated by the hunk window.
 */
export class Diff extends Node<DiffState> {
  protected async _render(ctx: RenderCtx): Promise<string[]> {
    // Resolve `path`-driven defaults for `lang` (highlightPair) and
    // `title` (inner chrome). Explicit fields still win.
    const path = this.state.path === undefined ? undefined : unwrap(this.state.path)
    const lang =
      this.state.lang ?? (path !== undefined ? extname(path).slice(1).toLowerCase() : undefined)
    const title = this.state.title ?? path

    const rows = await buildDiffRows(ctx, this.state, lang)

    // Each row already carries its own backdrop + prefix + highlighted
    // content. Wrap in a `code`-styled box so the title row, gutter,
    // and surrounding padding pick up the same backdrop as a plain
    // code block — visual continuity with `code()`.
    const body = rows.join("\n")
    const titleNode =
      title === undefined
        ? undefined
        : text((tctx) => tctx.style.codeTitle(unwrap(title)), { wrap: "none" })
    const wrapper = box(
      { bg: "code", flexDirection: "column", width: "fit" },
      titleNode,
      text(body, { wrap: "none" })
    )
    return wrapper.render(ctx)
  }
}

/**
 * Factory for `Diff`.
 *
 * ```ts
 * diff({
 *   original: readFileSync("foo.ts", "utf8"),
 *   edits: [{ from: 10, to: 12, replacement: ["new line a", "new line b"] }],
 *   lang: "ts",
 *   title: "foo.ts",
 * })
 * ```
 */
export function diff(state: DiffState): Diff {
  return new Diff(state)
}

// ---------- internals ----------

type DiffRow =
  | { type: "context"; origNum: number; newNum: number; content: string }
  | { type: "remove"; origNum: number; content: string }
  | { type: "add"; newNum: number; content: string }

async function buildDiffRows(
  ctx: RenderCtx,
  state: DiffState,
  lang: string | undefined
): Promise<string[]> {
  const context = state.context ?? 3
  const original = unwrap(state.original)
  const edits = unwrap(state.edits)
  const origLines = original.split("\n")

  // Apply edits in order to compute the edited file. Track, for each
  // edit (sorted by `from`), where its replacement starts in the edited
  // line array — used to compute `newNum` values.
  const sorted = edits.toSorted((a, b) => a.from - b.from)
  const editedLines: string[] = []
  const replacementStart: number[] = [] // per-edit index → editedLines offset
  let cursor = 0
  for (const e of sorted) {
    for (let i = cursor; i < e.from; i++) editedLines.push(origLines[i])
    replacementStart.push(editedLines.length)
    for (const r of e.replacement) editedLines.push(r)
    cursor = e.to
  }
  for (let i = cursor; i < origLines.length; i++) editedLines.push(origLines[i])

  // Highlight both sides as complete files so context tokens the way it
  // would in the real source. Unknown / missing lang → plain lines.
  const { origHi, editedHi } = await highlightPair(ctx, lang, origLines, editedLines)

  // Build the structured row list.
  const rows: DiffRow[] = []
  let emittedOrigUpTo = -1 // highest origLines index already included
  for (let i = 0; i < sorted.length; i++) {
    const e = sorted[i]
    const newFrom = replacementStart[i]

    // Context before the edit. Start at max(prior-emitted + 1, e.from - context).
    const ctxStart = Math.max(emittedOrigUpTo + 1, e.from - context)
    for (let j = ctxStart; j < e.from; j++) {
      const newNum = newFrom - (e.from - j)
      rows.push({
        content: editedHi[newNum] ?? origHi[j] ?? "",
        newNum: newNum + 1,
        origNum: j + 1,
        type: "context",
      })
    }

    // Removed.
    for (let j = e.from; j < e.to; j++) {
      rows.push({ content: origHi[j] ?? "", origNum: j + 1, type: "remove" })
    }

    // Added.
    for (let k = 0; k < e.replacement.length; k++) {
      rows.push({ content: editedHi[newFrom + k] ?? "", newNum: newFrom + k + 1, type: "add" })
    }

    emittedOrigUpTo = e.to - 1

    // Context after. Stop at the next edit's start to avoid overlap.
    const nextFrom = i + 1 < sorted.length ? sorted[i + 1].from : Number.POSITIVE_INFINITY
    const ctxEnd = Math.min(e.to + context, origLines.length, nextFrom)
    for (let j = e.to; j < ctxEnd; j++) {
      const newNum = newFrom + e.replacement.length + (j - e.to)
      rows.push({
        content: editedHi[newNum] ?? origHi[j] ?? "",
        newNum: newNum + 1,
        origNum: j + 1,
        type: "context",
      })
      emittedOrigUpTo = j
    }
  }

  return renderRows(ctx, rows, origLines.length, editedLines.length)
}

async function highlightPair(
  ctx: RenderCtx,
  lang: string | undefined,
  origLines: string[],
  editedLines: string[]
): Promise<{ origHi: string[]; editedHi: string[] }> {
  if (lang === undefined || lang === "") {
    return { editedHi: editedLines, origHi: origLines }
  }
  try {
    const highlight = await createAnsiHighlighter({
      langs: [lang],
      theme: ctx.style.theme.shiki,
    })
    const splitHi = (src: string[]): string[] => {
      const out = highlight(src.join("\n"), lang)
      // Shiki appends a trailing "\n"; drop it so split yields the same
      // number of lines as the input.
      return out.replace(/\n$/, "").split("\n")
    }
    const origHi = splitHi(origLines)
    const editedHi = splitHi(editedLines)
    // If shiki couldn't match the lang, both are the input verbatim —
    // fine, we fall through with plain lines.
    return { editedHi, origHi }
  } catch {
    return { editedHi: editedLines, origHi: origLines }
  }
}

function renderRows(
  ctx: RenderCtx,
  rows: DiffRow[],
  origTotal: number,
  editedTotal: number
): string[] {
  // Gutter width: widest line number on either side.
  const numWidth = Math.max(String(origTotal).length, String(editedTotal).length, 1)

  const s = ctx.style

  // Single line-number column. `origNum` for removed rows (the line in
  // the pre-edit file); `newNum` for context and added rows (continuous
  // numbering in the post-edit file). That way the visible numbers read
  // like what you'd see opening either side of the diff.
  const gutterWidth = numWidth + 1 // "<num> "
  const contentWidth = Math.max(0, ctx.width - gutterWidth)

  const out: string[] = []
  for (const r of rows) {
    const num = r.type === "remove" ? r.origNum : r.newNum
    const gutter = s.diffLine(`${pad(String(num), numWidth)} `)

    const prefix = r.type === "add" ? "+ " : r.type === "remove" ? "- " : "  "
    // Pad body so the row bg fills all the way to the right edge —
    // no trailing gap between our backdrop and the surrounding box.
    const pw = Math.max(0, contentWidth - stringWidth(prefix))
    const body = r.content + " ".repeat(Math.max(0, pw - stringWidth(r.content)))
    const bodyLine = prefix + body

    const rowStyle = r.type === "add" ? s.diffAdd : r.type === "remove" ? s.diffDel : undefined
    const styledBody = rowStyle === undefined ? bodyLine : rowStyle(bodyLine)

    out.push(gutter + styledBody)
  }
  return out
}

function pad(s: string, width: number): string {
  return s.length >= width ? s : " ".repeat(width - s.length) + s
}
