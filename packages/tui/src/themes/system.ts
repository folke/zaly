import type { TerminalPaletteSnapshot } from "../input/queries.ts"
import type { Color, HexColor } from "../style/types.ts"
import type { Theme } from "./types.ts"

import { blend } from "../style/color.ts"
import { isDark } from "../style/oklch.ts"
import { defaultsAnsi, defaultsDark, defaultsLight, defaultsSystem } from "./default.ts"

export interface TerminalPalette {
  /** ANSI colors in index order, 0–15. */
  ansi: readonly HexColor[]
  bg: HexColor
  fg: HexColor
  appearance?: Theme["appearance"]
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

/** @internal Replace palette-name bases while retaining authored lightness adjustments. */
export function internalizePalette(
  theme: Omit<Theme, "id">,
  colors: ReadonlyMap<string, HexColor>
): Omit<Theme<false>, "id"> {
  const color = (value: string) => {
    const [, base, suffix = ""] = value.match(/^(.+?)([+-]\d+)?$/) ?? ["", value]
    const hex = colors.get(base)
    return (hex === undefined ? value : `${hex}${suffix}`) as Color
  }
  return Object.fromEntries(
    Object.entries(theme).map(([key, value]) => {
      if (["$schema", "id", "name", "shiki", "appearance"].includes(key)) return [key, value]
      if (typeof value === "string") return [key, color(value)]
      if (typeof value !== "object") return [key, value]
      const style = { ...value }
      if (style.fg !== undefined) style.fg = color(style.fg)
      if (style.bg !== undefined) style.bg = color(style.bg)
      return [key, style]
    })
  ) as Omit<Theme<false>, "id">
}

/** Freeze a complete terminal palette into a file-compatible RGB theme. */
export function themeFromPalette(palette: TerminalPalette): Omit<Theme<false>, "id"> {
  if (palette.ansi.length !== 16)
    throw new Error("A terminal palette requires exactly 16 ANSI colors")
  const appearance = palette.appearance ?? (isDark(palette.bg) ? "dark" : "light")
  const colors = new Map<string, HexColor>(ANSI_NAMES.map((name, i) => [name, palette.ansi[i]]))
  for (const name of ["brightGray", "brightGrey", "gray", "grey"]) colors.set(name, palette.ansi[8])
  const theme: Omit<Theme, "id"> = {
    ...(appearance === "dark" ? defaultsDark : defaultsLight),
    ...defaultsSystem,
    ...Object.fromEntries(colors),
    appearance,
    bg: palette.bg,
    diffAdd: { bg: blend(palette.ansi[2], palette.bg, 0.2), fg: "success" },
    diffDel: { bg: blend(palette.ansi[1], palette.bg, 0.2), fg: "error" },
    fg: palette.fg,
    muted: blend(palette.fg, palette.bg, 0.5),
    selection: { bg: blend(palette.ansi[12], palette.bg, 0.3) },
    syntaxField: "fg",
  }
  if (palette.selectionBg) theme.selection = { bg: palette.selectionBg, fg: palette.selectionFg }
  return internalizePalette(theme, colors)
}

/** Choose the richest coherent strategy supported by this terminal snapshot. */
export function systemTheme(
  snapshot?: TerminalPaletteSnapshot,
  reportedAppearance: Theme["appearance"] = "dark"
): Theme {
  let appearance = reportedAppearance
  if (snapshot?.bg) appearance = isDark(snapshot.bg) ? "dark" : "light"
  const identity = {
    appearance,
    id: "system",
    name: "System",
    shiki: "auto",
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
        appearance,
        bg: snapshot.bg,
        fg: snapshot.fg,
      }),
      ...identity,
    }
  }
  if (snapshot?.bg) {
    return {
      ...(appearance === "dark" ? defaultsDark : defaultsLight),
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
