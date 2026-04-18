import type { Theme } from "../core/ctx.ts"
import type { Style } from "../core/types.ts"

import { colorParams } from "./color.ts"

export const RESET = "\x1b[0m"

// Attribute → SGR code. Order matters for stable output.
const ATTRS = [
  ["bold", 1],
  ["dim", 2],
  ["italic", 3],
  ["underline", 4],
  ["inverse", 7],
  ["strikethrough", 9],
] as const satisfies readonly (readonly [keyof Style, number])[]

/**
 * Build the opening SGR escape for a style descriptor. Returns '' if nothing
 * would be emitted. Unresolvable colors (invalid or 'inherit') are dropped.
 *
 * When `theme` is provided, `fg`/`bg` values matching a theme color slot
 * (e.g. `"primary"`, `"muted"`) are resolved against it first. The output
 * ordering is attrs → fg → bg, combined into a single `\x1b[...m` run.
 */
export function openStyle(style: Style, theme?: Theme): string {
  const params: (number | string)[] = []

  for (const [key, code] of ATTRS) {
    if (style[key]) params.push(code)
  }

  if (style.fg !== undefined) {
    const p = colorParams(style.fg, "fg", theme)
    if (p !== undefined) params.push(p)
  }

  if (style.bg !== undefined) {
    const p = colorParams(style.bg, "bg", theme)
    if (p !== undefined) params.push(p)
  }

  if (params.length === 0) return ""
  return `\x1b[${params.join(";")}m`
}
