import type { ShikiTheme } from "../shiki/types.ts"
import type { Color, Style } from "../style/types.ts"

/**
 * A theme slot value. Color shortcuts expand to `{ fg: <color> }` at resolve
 * time; Style objects are used as-is and may carry attrs (`bold`, `underline`,
 * etc.) and a `bg`. Use Color for simple fg-only slots; escalate to Style when
 * the part needs more than just a foreground color.
 */
export type ThemeValue = Color | Style

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
export type Theme = {
  /** Optional name of a matching Shiki syntax-highlighting theme. Code
   *  blocks and fenced markdown snippets look this up so highlighting
   *  aligns with the TUI palette. Leave unset for themes without a
   *  Shiki counterpart. */
  shiki?: ShikiTheme

  // ── base colors ──────────────────────────────────────────────────────

  /** Brand / primary accent. */
  primary: Color
  /** Secondary accent — distinct hue from `primary`. */
  accent: Color

  // ── text ─────────────────────────────────────────────────────────────

  /** Default text color used by themed blocks (markdown content, code,
   *  quotes) that compose `fg: "text"` into their style. Defaults to
   *  `"inherit"` (terminal fg). Set explicitly when a theme wants
   *  themed text inside its tinted regions. */
  text: Color
  /** Secondary text — first tier of the quietness ladder
   *  (`muted` → `quiet` → `comment`). Slightly faded but readable;
   *  good for timestamps, captions, less-prominent labels. */
  muted: ThemeValue
  /** De-emphasized but still readable. Reasoning / thinking text,
   *  secondary annotations, hints. */
  quiet: ThemeValue
  /** Editor-comment tier — soft, often tinted. Used for code
   *  annotations, line-number labels, italic quotes. */
  comment: ThemeValue
  /** Section / panel titles. Typically `bold` + a fg color. */
  title: ThemeValue

  // ── surface & structure ──────────────────────────────────────────────

  /** Structural neutral — applied as fg for borders, dividers, and the
   *  gutter; as bg for subtly-tinted surfaces. Never used for
   *  de-emphasized text; that's the `muted` / `quiet` / `comment`
   *  tier. */
  subtle: ThemeValue
  /** Default UI surface. Bottom of the stack. */
  ui: ThemeValue
  /** Popup / modal surface. One tier above `ui`. */
  overlay: ThemeValue
  /** Tinted region for emphasized content within the stream — user
   *  bubble bg, focused row, callout. Distinct from `code`, which is
   *  reserved for code-block bg. */
  highlight: ThemeValue

  // ── ui primitives ────────────────────────────────────────────────────

  /** Separators between messages or sections. */
  divider: ThemeValue
  /** Highlighted text in inputs, lists, autocomplete. */
  selection: ThemeValue
  /** Line-number column, diff markers. */
  gutter: ThemeValue
  /** Main input-prompt styling. */
  prompt: ThemeValue
  /** Structural border around panels, boxes, tables. */
  border: ThemeValue
  /** Title text inside a bordered region (slightly stronger than
   *  `border`). */
  borderTitle: ThemeValue

  // ── code ─────────────────────────────────────────────────────────────

  /** Code-block surface (bg + optional fg). Default for `mdCodeBlock`. */
  code: ThemeValue
  /** Title above a code block (e.g. file path). */
  codeTitle: ThemeValue

  // ── log levels ───────────────────────────────────────────────────────

  success: Color
  info: Color
  warn: Color
  error: Color

  // ── markdown ─────────────────────────────────────────────────────────

  mdBold: ThemeValue
  mdCode: ThemeValue
  mdCodeBlock: ThemeValue
  mdCodeBlockTitle: ThemeValue
  mdHeading1: ThemeValue
  mdHeading2: ThemeValue
  mdHeading3: ThemeValue
  mdHeading4: ThemeValue
  mdHeading5: ThemeValue
  mdHeading6: ThemeValue
  mdHeading: ThemeValue
  mdHr: ThemeValue
  mdItalic: ThemeValue
  mdLink: ThemeValue
  mdListBullet: ThemeValue
  mdListChecked: ThemeValue
  mdListUnchecked: ThemeValue
  mdQuote: ThemeValue
  mdStrikethrough: ThemeValue
  mdTable: ThemeValue
  mdTableHeader: ThemeValue

  // ── menu ─────────────────────────────────────────────────────────────

  optionName: ThemeValue
  optionDesc: ThemeValue
  /** Currently-highlighted entry. */
  optionActive: ThemeValue

  // ── diff ─────────────────────────────────────────────────────────────

  diffAdd: ThemeValue
  diffContext: ThemeValue
  diffDel: ThemeValue
  diffLine: ThemeValue
  diffTitle: ThemeValue
}
