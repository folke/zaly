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

export type CbNoMeta = (children: string) => string | null | undefined
export type CbWith<M> = (children: string, meta: M) => string | null | undefined

export interface MdCodeBlockMeta {
  /** The info-string language (e.g. `"js"`). */
  language?: string
  /** File title from the fenced info-string, e.g. `title="src/foo.ts"`. */
  title?: string
}

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
export type RenderMarkdown = (input: string, callbacks: MdCallbacks, opts?: MdOptions) => string

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
