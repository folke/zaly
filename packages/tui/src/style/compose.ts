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
