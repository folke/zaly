import type { Simplify } from "@zaly/shared"
import type { Theme } from "./types.ts"

export type CustomTheme = Simplify<
  Partial<Pick<Theme<false>, keyof typeof defaultsDark>> &
    Omit<Theme<false>, keyof typeof defaultsDark> & { $schema?: string }
>

/**
 * Slot-level fallbacks. Every Theme value is shallow-merged on top of
 * this record by `resolveTheme`, so partial JSON themes only need to
 * declare slots that diverge from these defaults.
 *
 * Distinct from `defaultTheme` — that's the precomputed `tokyonight-moon`
 * Theme bundled as the default palette for `createCtx()` etc.
 */
// oxlint-disable-next-line sort-keys
export const defaultsDark = {
  mode: "dark",
  shiki: "auto",

  // text
  muted: { dim: true },
  quiet: { dim: true, fg: "muted", italic: true },
  comment: { fg: "muted", italic: true },
  title: { bold: true, fg: "primary" },
  delim: "muted",

  // surface & structure
  ui: { bg: "bg+3" },
  overlay: { bg: "ui" },
  highlight: { bg: "ui" },

  // ui primitives
  divider: "bg-5",
  gutter: "quiet",
  prompt: "inherit",
  border: "divider",
  borderTitle: "title",

  // code
  code: { bg: "bg+3" },
  codeTitle: "title",

  // syntax
  syntaxDelimiter: "delim",
  syntaxBracket: "delim",

  // markdown
  mdBold: { bold: true },
  mdCode: { bg: "highlight", fg: "primary" },
  mdCodeBlock: "code",
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
  diffContext: { bg: "code" },
  diffAddNum: { bg: "diffAdd+10" },
  diffDelNum: { bg: "diffDel+10" },
  diffContextNum: { bg: "diffContext+10" },
} satisfies Partial<Theme<false>>

// oxlint-disable-next-line sort-keys
export const defaultsLight = {
  ...defaultsDark,
  mode: "light",
  shiki: "auto",
  ui: { bg: "bg-3" },
  highlight: { bg: "bg-3" },
  divider: "fg-5",
  code: { bg: "bg-2" },
  diffAddNum: { bg: "diffAdd-10" },
  diffDelNum: { bg: "diffDel-10" },
  diffContextNum: { bg: "diffContext-10" },
} satisfies Partial<Theme<false>>

// oxlint-disable-next-line sort-keys
export const defaultsSystem = {
  // base colors
  primary: "blue",
  accent: "brightMagenta",

  bg: "inherit",
  fg: "inherit",

  selection: { inverse: true },
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
} satisfies Partial<Theme>

// oxlint-disable-next-line sort-keys
export const defaultsAnsi = {
  divider: "brightBlue",
  border: "brightBlue",
  highlight: { bg: "brightBlack" },
  ui: {},
  code: {},
  diffAdd: { fg: "success" },
  diffDel: { fg: "error" },
} satisfies Partial<Theme>
