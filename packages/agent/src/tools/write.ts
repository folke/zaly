import { defineTool, AiError } from "@zaly/ai"
import { normPath, safeStat } from "@zaly/shared"
import { mkdir, writeFile, stat } from "node:fs/promises"
import { dirname } from "pathe"
import { Type } from "typebox"
import { assertFresh, trackFile } from "./read.ts"

export type WriteTool = typeof writeTool

/**
 * Write a file to disk. Overwrites if the file exists; creates parent
 * directories as needed.
 *
 * Content is written verbatim — no trailing-newline injection, no
 * line-ending normalisation, no whitespace stripping. The model
 * supplies the bytes it wants on disk.
 *
 * Freshness: when the target file already exists, the model must have
 * read it in this session and the on-disk mtime must be unchanged
 * since that read. Otherwise the tool refuses with `FILE_NOT_FRESH` —
 * "read this file before overwriting it." New files (path doesn't
 * exist) bypass this check; nothing to be fresh against.
 *
 * Returns a small acknowledgement (`{ ok, bytes, lines }`) rather than
 * echoing the content back — the model already has it.
 */
// oxlint-disable-next-line sort-keys -- semantic field order: name, desc, params, call
export const writeTool = defineTool({
  name: "write",
  desc:
    "Write content to a file. Overwrites existing files (must be read first); " +
    "creates parent directories as needed. Returns the byte count and line " +
    "count of the written file.",
  // oxlint-disable-next-line sort-keys -- semantic param order
  params: Type.Object({
    path: Type.String({ description: "Path to the file. Absolute or cwd-relative." }),
    content: Type.String({ description: "File contents to write, verbatim." }),
  }),

  async call(args, ctx): Promise<{ ok: true; path: string; bytes: number; lines: number }> {
    const path = normPath(ctx.cwd, args.path)
    await ctx.need?.("write", path)

    // Existing file → freshness required. New file → no requirement.
    if (safeStat(path)?.isFile()) assertFresh(path, ctx)

    try {
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, args.content, "utf8")
    } catch (error) {
      throw new AiError({
        cause: error,
        code: "WRITE_FAILED",
        message: `failed to write ${path}: ${error instanceof Error ? error.message : String(error)}`,
      })
    }

    // Record post-write so the model can re-edit without an immediate
    // re-read. Captures the new mtime.
    const fstat = await stat(path)
    trackFile({ full: true, kind: "write", mtime: fstat.mtimeMs, path }, ctx)

    const bytes = Buffer.byteLength(args.content, "utf8")
    const lines = countLines(args.content)
    return { bytes, lines, ok: true, path }
  },
})

/** Count lines the way an editor would — non-empty trailing line counts;
 *  trailing newline doesn't add a phantom blank line. */
function countLines(content: string): number {
  if (content === "") return 0
  let n = 1
  for (const c of content) if (c === "\n") n++
  // A trailing newline means the count is one too high (no real line follows).
  if (content.endsWith("\n")) n--
  return n
}
