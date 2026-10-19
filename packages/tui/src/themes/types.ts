import type { ShikiSelection } from "../shiki/types.ts"
import type { AnyStyle, Color } from "../style/types.ts"

/**
 * A theme is a flat record mapping semantic slots to `ThemeValue`s. Callers
 * reference slots by key (`fg: "primary"` for colors, `borderStyle: "border"`
 * for style refs) and the framework resolves through the theme at render time.
 *
 * Built-in themes live as JSON under `assets/themes/`. `tokyonight-moon` is
 * bundled as the default; load any other theme by name via
 * `loadTheme("tokyonight-storm")`.
 *
 * **Text quietness ladder** (most → least prominent): `fg` (terminal
 * default) → `muted` → `quiet` → `comment`. Pick the lowest tier
 * that still reads cleanly against the background.
 *
 * **Surface tiers**: `ui` → `subtle` → `overlay` (bottom → top).
 * `highlight` is orthogonal — a tinted accent surface, not a tier.
 */
export type Theme<Ansi extends boolean = true, T = AnyStyle<Ansi>> = {
  id: string
  mode: "dark" | "light"
  name?: string
  /** Matching bundled Shiki theme. Unset or "auto" generates highlighting
   *  from the syntax slots. */
  shiki?: ShikiSelection

  // ── base colors ──────────────────────────────────────────────────────

  fg: Color<Ansi, Ansi>
  bg: Color<Ansi, Ansi>
  /** Brand / primary accent. */
  primary: Color<Ansi>
  /** Secondary accent — distinct hue from `primary`. */
  accent: Color<Ansi>

  // ── text ─────────────────────────────────────────────────────────────

  /** Secondary text — first tier of the quietness ladder
   *  (`muted` → `quiet` → `comment`). Slightly faded but readable;
   *  good for timestamps, captions, less-prominent labels. */
  muted: T
  /** De-emphasized but still readable. Reasoning / thinking text,
   *  secondary annotations, hints. */
  quiet: T
  /** Editor-comment tier — soft, often tinted. Used for code
   *  annotations, line-number labels, italic quotes. */
  comment: T
  /** Section / panel titles. Typically `bold` + a fg color. */
  title: T
  /** Structural separators — borders, dividers, gutter lines. */
  delim: T

  // ── surface & structure ──────────────────────────────────────────────

  /** Default UI surface. Bottom of the stack. */
  ui: T
  /** Popup / modal surface. One tier above `ui`. */
  overlay: T
  /** Tinted region for emphasized content within the stream — user
   *  bubble bg, focused row, callout. Distinct from `code`, which is
   *  reserved for code-block bg. */
  highlight: T

  // ── ui primitives ────────────────────────────────────────────────────

  /** Separators between messages or sections. */
  divider: T
  /** Highlighted text in inputs, lists, autocomplete. */
  selection: T
  /** Line-number column, diff markers. */
  gutter: T
  /** Main input-prompt styling. */
  prompt: T
  /** Structural border around panels, boxes, tables. */
  border: T
  /** Title text inside a bordered region (slightly stronger than
   *  `border`). */
  borderTitle: T

  // ── code ─────────────────────────────────────────────────────────────

  /** Code-block surface (bg + optional fg). Default for `mdCodeBlock`. */
  code: T
  /** Title above a code block (e.g. file path). */
  codeTitle: T

  // ── log levels ───────────────────────────────────────────────────────

  success: Color<Ansi>
  info: Color<Ansi>
  warn: Color<Ansi>
  error: Color<Ansi>

  // ── syntax ───────────────────────────────────────────────────────────
  syntaxBoolean: T
  syntaxBracket: T
  syntaxConstant: T
  syntaxDelimiter: T
  syntaxField: T
  syntaxFunction: T
  syntaxNumber: T
  syntaxSpecial: T
  syntaxString: T

  // ── markdown ─────────────────────────────────────────────────────────

  mdBold: T
  mdCode: T
  mdCodeBlock: T
  mdCodeBlockTitle: T
  mdHeading1: T
  mdHeading2: T
  mdHeading3: T
  mdHeading4: T
  mdHeading5: T
  mdHeading6: T
  mdHeading: T
  mdHr: T
  mdItalic: T
  mdLink: T
  mdListBullet: T
  mdListChecked: T
  mdListUnchecked: T
  mdQuote: T
  mdStrikethrough: T
  mdTable: T
  mdTableHeader: T

  // ── menu ─────────────────────────────────────────────────────────────

  optionName: T
  optionDesc: T
  /** Currently-highlighted entry. */
  optionActive: T

  // ── diff ─────────────────────────────────────────────────────────────
  diffAdd: T
  diffDel: T
  diffContext: T
  diffAddNum: T
  diffDelNum: T
  diffContextNum: T
}
