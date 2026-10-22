import type { Tool, ToolContext } from "@zaly/ai"

import { extractToolResults } from "@zaly/ai"
import { normPath, safeStat } from "@zaly/shared"

export type FileMeta = {
  path: string
  mtime: number
  kind: "read" | "write" | "edit"
  /** True when the result reflects the whole-file content — set by
   *  un-sliced `read` and by `write` (which always replaces the
   *  full file). Used by the masker to know whether this result
   *  subsumes earlier reads of the same path. `edit` never sets it
   *  because the result is patch-relative. */
  full?: boolean
  unchanged?: boolean
}

export type FileTool = Tool<{ path: string }, unknown, FileMeta>

function isFileMeta(meta: unknown): meta is FileMeta {
  const m = meta as Partial<Record<string, unknown>> | undefined | null
  return (
    m !== undefined &&
    m !== null &&
    typeof m === "object" &&
    typeof m.path === "string" &&
    typeof m.mtime === "number" &&
    (m.kind === "read" || m.kind === "write" || m.kind === "edit")
  )
}

export function isUnchanged(path: string, ctx: ToolContext): boolean {
  path = normPath(ctx.cwd, path)
  const mtime = safeStat(path)?.mtimeMs
  if (mtime === undefined) return false

  const messages = ctx.messages ?? []
  for (const { m, $p, p } of extractToolResults<FileMeta>(messages)) {
    const id = m.id
    if (!id || !isFileMeta(p.meta) || p.meta.path !== path || ctx.isMasked?.(id, $p)) continue
    if (p.meta.full && p.meta.mtime === mtime) return true // Fresh! The file's mtime matches what we saw at read time.
  }
  return false
}
