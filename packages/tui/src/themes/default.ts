// oxlint-disable typescript/no-deprecated
import type { Theme } from "./types.ts"

/**
 * Slot-level fallbacks. Every Theme value is shallow-merged on top of
 * this record by `resolveTheme`, so partial JSON themes only need to
 * declare slots that diverge from these defaults.
 *
 * Distinct from `defaultTheme` — that's the precomputed `tokyonight-moon`
 * Theme bundled as the default palette for `createCtx()` etc.
 */
// oxlint-disable-next-line sort-keys
export const defaults: Omit<Theme, "id"> = {
  // base colors
  primary: "blue",
  accent: "brightMagenta",

  // text
  text: "inherit",
  muted: { dim: true },
  quiet: { dim: true, fg: "muted", italic: true },
  comment: { fg: "muted", italic: true },
  title: { bold: true, fg: "primary" },
  delim: "muted",

  // surface & structure
  subtle: "brightBlack",
  ui: { bg: "subtle" },
  overlay: { bg: "subtle" },
  highlight: { bg: "subtle" },

  // ui primitives
  divider: "subtle",
  selection: { bg: "brightBlue", fg: "black" },
  gutter: "subtle",
  prompt: "inherit",
  border: "black",
  borderTitle: "title",

  // code
  code: { bg: "subtle" },
  codeTitle: "title",

  // log levels
  success: "green",
  info: "cyan",
  warn: "yellow",
  error: "red",

  // syntax
  syntaxNumber: "brightBlue",
  syntaxString: "green",
  syntaxBoolean: "yellow",
  syntaxFunction: "blue",
  syntaxField: "white",
  syntaxConstant: "magenta",
  syntaxSpecial: "red",
  syntaxDelimiter: "delim",
  syntaxBracket: "delim",

  // markdown
  mdBold: { bold: true },
  mdCode: { bg: "primary+10", fg: "black" },
  mdCodeBlock: { bg: "highlight", fg: "primary" },
  mdCodeBlockTitle: "title",
  mdHeading1: "mdHeading",
  mdHeading2: { bold: true, fg: "accent" },
  mdHeading3: "mdHeading2",
  mdHeading4: "mdHeading2",
  mdHeading5: "mdHeading2",
  mdHeading6: "mdHeading2",
  mdHeading: "title",
  mdHr: "accent",
  mdItalic: { italic: true },
  mdLink: { fg: "primary", underline: true },
  mdListBullet: "accent",
  mdListChecked: "primary",
  mdListUnchecked: "primary",
  mdQuote: "muted",
  mdStrikethrough: { strikethrough: true },
  mdTable: "accent",
  mdTableHeader: "title",

  // menu
  optionActive: "selection",
  optionDesc: "muted",
  optionName: "primary",

  // diff
  diffAdd: { bg: "success-50", fg: "success" },
  diffContext: "muted",
  diffDel: { bg: "error-50", fg: "error" },
  diffLine: "gutter",
  diffTitle: "title",
}

// oxlint-disable-next-line sort-keys
export const ansi: Theme = {
  id: "ansi",
  name: "ANSI",
  ...defaults,
  selection: { inverse: true },
  diffAdd: { fg: "success" },
  diffDel: { fg: "error" },
}
