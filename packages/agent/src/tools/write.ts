import type { ToolContext } from "@zaly/ai"
import type { FileMeta } from "./read.ts"

import { AiError, defineTool } from "@zaly/ai"
import { normPath, safeReadFile } from "@zaly/shared"
import { detectEol, normalizeEol } from "@zaly/shared/text"
import { mkdir, stat, writeFile } from "node:fs/promises"
import { dirname } from "pathe"
import { Type } from "typebox"

export type WriteTool = typeof writeTool

export type WriteToolMeta = FileMeta & {
  /** File content before the write. Undefined for new files. The
   *  post-write content is recoverable from the original call's
   *  `params.content`, so we don't redundantly stash it on meta. */
  original?: string
}

/**
 * Write a file to disk. Overwrites if the file exists; creates parent
 * directories as needed.
 *
 * Content is written *verbatim* in everything but line endings. The
 * model always emits LF; this tool detects the existing file's
 * line-ending style (or the platform default for new files via
 * `detectEol`) and re-applies it on write so a CRLF file stays CRLF
 * after an LF-from-the-model overwrite. No trailing-newline injection,
 * no whitespace stripping.
 *
 * Returns a small acknowledgement (`{ ok, bytes, lines }`) rather than
 * echoing the content back — the model already has it. `bytes` reflects
 * the on-disk byte count, including any extra bytes from CRLF expansion.
 */
// oxlint-disable-next-line sort-keys -- semantic field order: name, desc, params, call
export const writeTool = defineTool({
  name: "write",
  desc:
    "Write content to a file. Overwrites existing files; " +
    "creates parent directories as needed. Returns the byte count and line " +
    "count of the written file.",
  // oxlint-disable-next-line sort-keys -- semantic param order
  params: Type.Object({
    path: Type.String({ description: "Path to the file. Absolute or cwd-relative." }),
    content: Type.String({ description: "File contents to write, verbatim." }),
  }),

  async preflight(args, ctx: ToolContext<WriteToolMeta>) {
    const path = normPath(ctx.cwd, args.path)
    await ctx.need?.("write", path)
  },

  async call(
    args,
    ctx: ToolContext<WriteToolMeta>
  ): Promise<{ ok: true; path: string; bytes: number; lines: number }> {
    const path = normPath(ctx.cwd, args.path)

    let text: string
    let original: string | undefined
    try {
      original = await safeReadFile(path)
      const eol = detectEol({ path, text: original })
      text = normalizeEol(args.content, { eol })
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, text, "utf8")
    } catch (error) {
      throw new AiError({
        cause: error,
        code: "WRITE_FAILED",
        message: `failed to write ${path}: ${error instanceof Error ? error.message : String(error)}`,
      })
    }

    // Record the new mtime for unchanged-read detection and mark the
    // full-file replacement for context masking.
    const fstat = await stat(path)
    ctx.meta = { full: true, kind: "write", mtime: fstat.mtimeMs, original, path }

    const bytes = Buffer.byteLength(text, "utf8")
    const lines = countLines(text)
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
