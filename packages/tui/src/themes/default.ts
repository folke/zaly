import type { Theme } from "./types.ts"

/**
 * Slot-level fallbacks. Every Theme value is shallow-merged on top of
 * this record by `resolveTheme`, so partial JSON themes only need to
 * declare slots that diverge from these defaults.
 *
 * Distinct from `defaultTheme` — that's the precomputed `tokyonight-moon`
 * Theme bundled as the default palette for `createCtx()` etc.
 */
export const defaults: Theme = {
  accent: "brightMagenta",
  bg: "inherit",
  border: "muted",
  borderTitle: "title",
  code: { bg: "muted" },
  codeTitle: "title",

  diffAdd: { bg: "success/3", fg: "success" },
  diffContext: "dim",
  diffDel: { bg: "error/3", fg: "error" },
  diffLine: "line",

  diffTitle: "title",
  dim: "brightBlack",
  error: "red",
  fg: "inherit",

  info: "cyan",
  line: "muted",
  mdBold: { bold: true, fg: "fg" },

  mdCode: { bg: "primary/15", fg: "primary" },
  mdCodeBlock: { bg: "muted", fg: "primary" },
  mdCodeBlockTitle: "title",
  mdHeading: "title",
  mdHeading1: "mdHeading",
  mdHeading2: { bold: true, fg: "accent" },
  mdHeading3: "mdHeading2",

  mdHeading4: "mdHeading2",
  mdHeading5: "mdHeading2",
  mdHeading6: "mdHeading2",
  mdHr: "accent",
  mdItalic: { fg: "fg", italic: true },
  mdLink: { fg: "primary", underline: true },
  mdListBullet: "accent",
  mdListChecked: "primary",
  mdListUnchecked: "primary",
  mdQuote: "dim",
  mdStrikethrough: { fg: "fg", strikethrough: true },

  mdTable: "accent",
  mdTableHeader: "title",
  menuActive: { bg: "muted" },

  menuHint: "muted",
  menuLabel: "primary",

  muted: "brightBlack",
  primary: "blue",
  success: "green",
  title: { bold: true, fg: "primary" },
  warn: "yellow",
}
