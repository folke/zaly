import type { Style } from "../style/ansi.ts"
import type { Color } from "../style/color.ts"
import type { ShikiTheme } from "../style/shiki.ts"

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
 */
export type Theme = {
  /** Optional name of a matching Shiki syntax-highlighting theme. Code
   *  blocks and fenced markdown snippets look this up so highlighting
   *  aligns with the TUI palette. Leave unset for themes without a
   *  Shiki counterpart. */
  shiki?: ShikiTheme
  fg: Color
  bg: Color
  primary: Color
  accent: Color
  dim: Color
  muted: Color

  success: Color
  info: Color
  warn: Color
  error: Color

  title: ThemeValue
  border: ThemeValue
  borderTitle: ThemeValue
  line: ThemeValue

  mdBold: ThemeValue
  mdItalic: ThemeValue
  mdStrikethrough: ThemeValue

  mdHeading: ThemeValue
  mdHeading1: ThemeValue
  mdHeading2: ThemeValue
  mdHeading3: ThemeValue
  mdHeading4: ThemeValue
  mdHeading5: ThemeValue
  mdHeading6: ThemeValue

  mdCode: ThemeValue
  mdCodeBlock: ThemeValue
  mdCodeBlockTitle: ThemeValue
  mdHr: ThemeValue
  mdLink: ThemeValue
  mdListBullet: ThemeValue
  mdListChecked: ThemeValue
  mdListUnchecked: ThemeValue
  mdQuote: ThemeValue
  mdTable: ThemeValue
  mdTableHeader: ThemeValue

  menuLabel: ThemeValue
  menuHint: ThemeValue
  menuActive: ThemeValue

  code: ThemeValue
  codeTitle: ThemeValue

  diffAdd: ThemeValue
  diffContext: ThemeValue
  diffDel: ThemeValue
  diffLine: ThemeValue
  diffTitle: ThemeValue
}
