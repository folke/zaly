// Lightweight string-level utilities for the markdown pipeline. Lives in
// its own file so Bun callers can use them without pulling in `marked`
// (which is the heavy dep in `src/md.ts`).

import type { MdCodeBlockMeta } from "./index.ts"

/** Sentinel stitched into fence info-strings in place of spaces. */
export const FENCE_MARKER = "\u0000"

/**
 * Replace spaces inside every fenced-block info-string with `FENCE_MARKER`
 * so renderers that truncate after the first token (Bun) still surface the
 * full info-string as the first token. Inverse of the decode step done by
 * `parseCodeInfoString`.
 *
 * Closing fences (just ``` with optional trailing whitespace) are left
 * untouched — rewriting their spaces into markers would prevent the
 * parser from recognizing the closer, swallowing the rest of the document
 * as code.
 */
export function encodeFenceInfoStrings(md: string): string {
  return md.replaceAll(/^( {0,3}`{3,})([^\n]*)$/gm, (match, fence: string, info: string) =>
    info.trim() === "" ? match : fence + info.replaceAll(" ", FENCE_MARKER)
  )
}

/**
 * Parse a fenced code-block info-string like `jsx title="src/Hello.js"`.
 * First token → language; `title="..."` / `title='...'` → title. Unknown
 * attrs after the language are ignored.
 *
 * Input may carry `FENCE_MARKER` in place of spaces (from
 * `encodeFenceInfoStrings`); those are decoded before parsing.
 */
export function parseCodeInfoString(info: string | undefined): MdCodeBlockMeta | undefined {
  if (!info) return undefined
  const decoded = info.includes(FENCE_MARKER) ? info.replaceAll(FENCE_MARKER, " ") : info
  const firstSpace = decoded.search(/\s/)
  if (firstSpace === -1) return { language: decoded }
  const language = decoded.slice(0, firstSpace)
  const rest = decoded.slice(firstSpace + 1)
  const titleMatch = /title=(?:"([^"]*)"|'([^']*)')/.exec(rest) as
    | [string, string | undefined, string | undefined]
    | null
  const title = titleMatch === null ? undefined : (titleMatch[1] ?? titleMatch[2])
  const meta: MdCodeBlockMeta = {}
  if (language !== "") meta.language = language
  if (title !== undefined) meta.title = title
  return meta
}
