import type { Theme } from "./index.ts"

/**
 * TokyoNight Moon — the default theme. Canonical palette from
 * `folke/tokyonight.nvim`. Override via `createRenderer({ theme })`.
 */
export const moon: Theme = {
  accent: "#c099ff",
  bg: "#222436",
  dim: "#828bb8",
  err: "#ff757f",
  fg: "#c8d3f5",
  muted: "#636da6",
  ok: "#c3e88d",
  primary: "#82aaff",
  warn: "#ffc777",
}

export default moon
