import type { Theme } from "./theme.ts"
import type { Style } from "./ansi.ts"
import type { Color } from "./color.ts"

import { RESET } from "./ansi.ts"

/**
 * Post-process a styled row so a parent's background is re-applied after any
 * full-reset escape (`\x1b[0m`) emitted by child content. Without this, a
 * child's reset clobbers the parent's bg for the remainder of the row.
 *
 * Caller passes the bg-only SGR run (`\x1b[48;2;r;g;bm`); if empty, the input
 * is returned unchanged.
 */
export function reapplyBg(s: string, bgEscape: string): string {
  if (bgEscape === "") return s
  return s.replaceAll(RESET, RESET + bgEscape)
}

/**
 * Resolve a style-slot reference into a `Style` object. A ref is either a
 * theme slot name (string) or an inline `Style`:
 *
 *  - Inline `Style` → returned as-is (no slot lookup).
 *  - String ref pointing at a **Color** slot → wrapped as `{ fg: <color> }`.
 *  - String ref pointing at a **Style** slot → returned as-is.
 *  - String ref that doesn't match a slot → `{}` (empty — emits nothing).
 *  - `undefined` → `{}`.
 *
 * Used by component "part" fields (e.g. `borderStyle`, `borderTitleStyle`) to
 * let callers pick a theme slot by name or override with a literal `Style`.
 */
export function resolveStyleSlot(ref: string | Style | undefined, theme: Theme): Style {
  if (ref === undefined) return {}
  if (typeof ref === "object") return ref
  const v = (theme as unknown as Record<string, Color | Style | undefined>)[ref]
  if (v === undefined) return {}
  if (typeof v === "string") return { fg: v }
  return v
}
