import type { Tokens } from "marked"
import type { MdCodeBlockMeta } from "./utils.ts"

import { marked } from "marked"
import { parseCodeInfoString } from "./utils.ts"

// ── Types (shape-compatible with Bun.markdown's RenderCallbacks) ──────────

export interface MdHeadingMeta {
  /** Heading level (1–6). */
  level: number
  /** Heading ID slug. Set when `headings: { ids: true }` is enabled. */
  id?: string
}

export interface MdListMeta {
  /** Whether this is an ordered list. */
  ordered: boolean
  /** The start number for ordered lists. */
  start?: number
  /** Nesting depth. `0` for top-level, `1` for a list inside a list item, etc. */
  depth: number
}

export interface MdListItemMeta {
  /** 0-based index of this item within its parent list. */
  index: number
  /** Nesting depth of the parent list. `0` for items in a top-level list. */
  depth: number
  /** Whether the parent list is ordered. */
  ordered: boolean
  /** The start number of the parent list (only set when `ordered` is true). */
  start?: number
  /** Task list checked state. Set for `- [x]` / `- [ ]` items. */
  checked?: boolean
}

export interface MdCellMeta {
  /** Column alignment. */
  align?: "left" | "center" | "right"
}

export interface MdLinkMeta {
  /** Link URL. */
  href: string
  /** Link title attribute. */
  title?: string
}

export interface MdImageMeta {
  /** Image URL. */
  src: string
  /** Image title attribute. */
  title?: string
}

type CbNoMeta = (children: string) => string | null | undefined
type CbWith<M> = (children: string, meta: M) => string | null | undefined

/**
 * Element callbacks for `renderMarkdown`. Each callback receives the
 * accumulated children as a string and optional metadata. Return a string
 * to render the element; return `null` / `undefined` to omit it. Omitted
 * callbacks fall through — children are emitted unchanged.
 */
export interface MdCallbacks {
  heading?: CbWith<MdHeadingMeta>
  paragraph?: CbNoMeta
  blockquote?: CbNoMeta
  code?: (children: string, meta?: MdCodeBlockMeta) => string | null | undefined
  list?: CbWith<MdListMeta>
  listItem?: CbWith<MdListItemMeta>
  hr?: CbNoMeta
  table?: CbNoMeta
  thead?: CbNoMeta
  tbody?: CbNoMeta
  tr?: CbNoMeta
  th?: (children: string, meta?: MdCellMeta) => string | null | undefined
  td?: (children: string, meta?: MdCellMeta) => string | null | undefined
  html?: CbNoMeta
  strong?: CbNoMeta
  emphasis?: CbNoMeta
  link?: CbWith<MdLinkMeta>
  image?: CbWith<MdImageMeta>
  codespan?: CbNoMeta
  strikethrough?: CbNoMeta
  text?: (text: string) => string | null | undefined
}

/**
 * A function that renders a markdown string by invoking `callbacks` for each
 * element. Signature matches both `renderMarkdown` (Node-side, marked-backed)
 * and `Bun.markdown.render`, so either can be plugged in via `MdOptions.render`.
 */
export type RenderMarkdown = (
  input: string,
  callbacks: MdCallbacks,
  opts?: MdOptions
) => string

/**
 * Parser options. Mirrors `Bun.markdown.Options`. Options marked "Bun-only"
 * are silently ignored on the Node side since marked doesn't support them.
 */
export interface MdOptions {
  /** GFM tables. Default: `true`. */
  tables?: boolean
  /** GFM strikethrough (`~~text~~`). Default: `true`. */
  strikethrough?: boolean
  /** GFM task lists (`- [x] item`). Default: `true`. */
  tasklists?: boolean
  /** Treat soft line breaks as hard breaks. Default: `false`. */
  hardSoftBreaks?: boolean
  /** Enable wiki-style links (`[[target]]`). Bun-only. */
  wikiLinks?: boolean
  /** `__text__` renders as underline instead of strong. Bun-only. */
  underline?: boolean
  /** Enable `$inline$` / `$$display$$` math. Bun-only. */
  latexMath?: boolean
  /** Collapse whitespace in text content. Bun-only. */
  collapseWhitespace?: boolean
  /** Allow ATX headers without a space after `#`. Bun-only. */
  permissiveAtxHeaders?: boolean
  /** Disable indented code blocks. Bun-only. */
  noIndentedCodeBlocks?: boolean
  /** Disable HTML blocks. */
  noHtmlBlocks?: boolean
  /** Disable inline HTML spans. Bun-only. */
  noHtmlSpans?: boolean
  /** GFM tag filter for disallowed HTML tags. Bun-only. */
  tagFilter?: boolean
  /** Enable autolinks. Pass an object for granular control. */
  autolinks?: boolean | { url?: boolean; www?: boolean; email?: boolean }
  /** Heading IDs / autolink headings. Bun-only. */
  headings?: boolean | { ids?: boolean; autolink?: boolean }
  /**
   * Override the renderer used by the `Markdown` component. When omitted,
   * the component uses whichever renderer the active runtime provides
   * (`Bun.markdown.render` on Bun, `renderMarkdown` on Node). Useful for
   * testing — e.g. rendering the same content through both implementations
   * side-by-side.
   */
  render?: RenderMarkdown
}

// ── Implementation (Node-side; Bun's runtime passes through to Bun.markdown) ──

/**
 * Walk the markdown source with `marked`'s lexer and invoke the caller's
 * callbacks for each block / inline element. Output shape matches
 * `Bun.markdown.render()` — same callback names, same metadata, same
 * "null/undefined omits, missing callback passes through" semantics.
 *
 * @internal
 */
export function renderMarkdown(input: string, callbacks: MdCallbacks, opts?: MdOptions): string {
  const tokens = marked.lexer(input, {
    breaks: opts?.hardSoftBreaks ?? false,
    gfm: true,
  })
  return renderTokens(tokens, callbacks, 0)
}

function renderTokens(tokens: Tokens.Generic[], cb: MdCallbacks, depth: number): string {
  let out = ""
  for (const tok of tokens) out += renderToken(tok, cb, depth)
  return out
}

function renderToken(tok: Tokens.Generic, cb: MdCallbacks, depth: number): string {
  switch (tok.type) {
    case "heading": {
      const t = tok as Tokens.Heading
      const children = renderTokens(t.tokens, cb, depth)
      return applyMeta(children, { level: t.depth }, cb.heading)
    }
    case "paragraph": {
      const t = tok as Tokens.Paragraph
      const children = renderTokens(t.tokens, cb, depth)
      return applyBlock(children, cb.paragraph)
    }
    case "blockquote": {
      const t = tok as Tokens.Blockquote
      const children = renderTokens(t.tokens, cb, depth)
      return applyBlock(children, cb.blockquote)
    }
    case "code": {
      const t = tok as Tokens.Code
      const meta = parseCodeInfoString(t.lang)
      if (cb.code === undefined) return t.text
      return cb.code(t.text, meta) ?? ""
    }
    case "list": {
      const t = tok as Tokens.List
      const ordered = t.ordered
      const start = ordered && t.start !== "" ? t.start : undefined
      const childDepth = depth + 1
      let items = ""
      for (let i = 0; i < t.items.length; i++) {
        const item = t.items[i]
        const kids = renderTokens(item.tokens, cb, childDepth)
        const meta: MdListItemMeta = {
          checked: item.task ? item.checked : undefined,
          depth,
          index: i,
          ordered,
          start,
        }
        items += applyMeta(kids, meta, cb.listItem)
      }
      return applyMeta(items, { depth, ordered, start }, cb.list)
    }
    case "hr": {
      return applyBlock("", cb.hr)
    }
    case "table": {
      const t = tok as Tokens.Table
      const aligns = t.align
      const renderCell = (
        cell: Tokens.TableCell,
        col: number,
        fn: MdCallbacks["th"] | MdCallbacks["td"]
      ): string => {
        const kids = renderTokens(cell.tokens, cb, depth)
        const a = aligns[col]
        const meta: MdCellMeta | undefined = a === null ? undefined : { align: a }
        if (fn === undefined) return kids
        return fn(kids, meta) ?? ""
      }
      const headerRow = t.header.map((c, i) => renderCell(c, i, cb.th)).join("")
      const thead = applyBlock(applyBlock(headerRow, cb.tr), cb.thead)
      const bodyRows = t.rows
        .map((row) => applyBlock(row.map((c, i) => renderCell(c, i, cb.td)).join(""), cb.tr))
        .join("")
      const tbody = applyBlock(bodyRows, cb.tbody)
      return applyBlock(thead + tbody, cb.table)
    }
    case "html": {
      const t = tok as Tokens.HTML
      return applyBlock(t.text, cb.html)
    }
    case "space": {
      // marked emits these for inter-block whitespace; drop — block callbacks
      // add their own trailing separators.
      return ""
    }
    case "strong": {
      const t = tok as Tokens.Strong
      const children = renderTokens(t.tokens, cb, depth)
      return applyBlock(children, cb.strong)
    }
    case "em": {
      const t = tok as Tokens.Em
      const children = renderTokens(t.tokens, cb, depth)
      return applyBlock(children, cb.emphasis)
    }
    case "codespan": {
      const t = tok as Tokens.Codespan
      if (cb.codespan === undefined) return t.text
      return cb.codespan(t.text) ?? ""
    }
    case "del": {
      const t = tok as Tokens.Del
      const children = renderTokens(t.tokens, cb, depth)
      return applyBlock(children, cb.strikethrough)
    }
    case "link": {
      const t = tok as Tokens.Link
      const children = renderTokens(t.tokens, cb, depth)
      return applyMeta(children, { href: t.href, title: t.title ?? undefined }, cb.link)
    }
    case "image": {
      const t = tok as Tokens.Image
      const meta: MdImageMeta = { src: t.href, title: t.title ?? undefined }
      if (cb.image === undefined) return t.text
      return cb.image(t.text, meta) ?? ""
    }
    case "br": {
      return "\n"
    }
    case "checkbox": {
      // marked emits this as a sibling of the task-item content. Drop —
      // the state is already carried on MdListItemMeta.checked.
      return ""
    }
    case "escape": {
      const t = tok as Tokens.Escape
      return applyText(t.text, cb)
    }
    case "text": {
      const t = tok as Tokens.Text
      // Block-level text wrappers carry inline tokens — recurse.
      if (t.tokens) return renderTokens(t.tokens, cb, depth)
      return applyText(t.text, cb)
    }
    default: {
      // Unknown / unsupported — pass through raw if available.
      const raw = (tok as { text?: string; raw?: string }).text
      return raw ?? (tok as { raw?: string }).raw ?? ""
    }
  }
}

function applyBlock(children: string, fn: CbNoMeta | undefined): string {
  if (fn === undefined) return children
  return fn(children) ?? ""
}

function applyMeta<M>(
  children: string,
  meta: M,
  fn: ((children: string, meta: M) => string | null | undefined) | undefined
): string {
  if (fn === undefined) return children
  return fn(children, meta) ?? ""
}

function applyText(text: string, cb: MdCallbacks): string {
  if (cb.text === undefined) return text
  return cb.text(text) ?? ""
}
