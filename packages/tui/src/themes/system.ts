import type { TerminalPaletteSnapshot } from "../input/queries.ts"
import type { HexColor } from "../style/types.ts"
import type { Theme } from "./types.ts"

import { blend } from "../style/color.ts"
import { isDark } from "../style/oklch.ts"
import { defaultsAnsi, defaultsDark, defaultsLight, defaultsSystem } from "./default.ts"

export interface TerminalPalette {
  /** ANSI colors in index order, 0–15. */
  ansi: readonly HexColor[]
  bg: HexColor
  fg: HexColor
  mode?: Theme["mode"]
  selectionBg?: HexColor
  selectionFg?: HexColor
}

const ANSI_NAMES = [
  "black",
  "red",
  "green",
  "yellow",
  "blue",
  "magenta",
  "cyan",
  "white",
  "brightBlack",
  "brightRed",
  "brightGreen",
  "brightYellow",
  "brightBlue",
  "brightMagenta",
  "brightCyan",
  "brightWhite",
] as const

/** Freeze ANSI references through named palette slots, using the normal resolver. */
export function themeFromPalette(palette: TerminalPalette): Omit<Theme, "id"> {
  if (palette.ansi.length !== 16)
    throw new Error("A terminal palette requires exactly 16 ANSI colors")
  const mode = palette.mode ?? (isDark(palette.bg) ? "dark" : "light")
  const colors = Object.fromEntries(ANSI_NAMES.map((name, i) => [name, palette.ansi[i]]))
  const theme: Omit<Theme, "id"> = {
    ...(mode === "dark" ? defaultsDark : defaultsLight),
    ...defaultsSystem,
    ...colors,
    bg: palette.bg,
    diffAdd: { bg: blend(palette.ansi[2], palette.bg, 0.2), fg: "success" },
    diffDel: { bg: blend(palette.ansi[1], palette.bg, 0.2), fg: "error" },
    fg: palette.fg,
    mode,
    muted: blend(palette.fg, palette.bg, 0.5),
    selection: { bg: blend(palette.ansi[12], palette.bg, 0.3) },
    syntaxField: "fg",
  }
  Object.assign(theme, {
    brightGray: palette.ansi[8],
    brightGrey: palette.ansi[8],
    gray: palette.ansi[8],
    grey: palette.ansi[8],
  })
  if (palette.selectionBg)
    theme.selection = { bg: palette.selectionBg, fg: palette.selectionFg ?? palette.fg }
  return theme
}

/** Choose the richest coherent strategy supported by this terminal snapshot. */
export function systemTheme(
  snapshot?: TerminalPaletteSnapshot,
  reportedMode: Theme["mode"] = "dark"
): Theme {
  let mode = reportedMode
  if (snapshot?.bg) mode = isDark(snapshot.bg) ? "dark" : "light"
  const identity = {
    id: "system",
    mode,
    name: "System",
    shiki: mode === "dark" ? "github-dark" : "github-light",
  } as const
  if (
    snapshot?.bg &&
    snapshot.fg &&
    snapshot.ansi.length === 16 &&
    snapshot.ansi.every((color) => color !== undefined)
  ) {
    return {
      ...themeFromPalette({
        ...snapshot,
        ansi: snapshot.ansi as HexColor[],
        bg: snapshot.bg,
        fg: snapshot.fg,
        mode,
      }),
      ...identity,
    }
  }
  if (snapshot?.bg) {
    return {
      ...(mode === "dark" ? defaultsDark : defaultsLight),
      ...defaultsSystem,
      ...identity,
      bg: snapshot.bg,
      diffAdd: { fg: "success" },
      diffDel: { fg: "error" },
      fg: snapshot.fg ?? "inherit",
      ...(snapshot.selectionBg
        ? {
            selection: {
              bg: snapshot.selectionBg,
              fg: snapshot.selectionFg ?? snapshot.fg ?? "inherit",
            },
          }
        : {}),
    }
  }
  return {
    ...defaultsDark,
    ...defaultsSystem,
    ...defaultsAnsi,
    ...identity,
  }
}
