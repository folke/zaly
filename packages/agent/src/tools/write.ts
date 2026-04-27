import { defineTool, ToolError } from "@zaly/ai"
import { mkdir, writeFile } from "node:fs/promises"
import { dirname, resolve } from "pathe"
import { Type } from "typebox"

/**
 * Write a file to disk. Overwrites if the file exists; creates parent
 * directories as needed.
 *
 * Content is written verbatim — no trailing-newline injection, no
 * line-ending normalisation, no whitespace stripping. The model
 * supplies the bytes it wants on disk.
 *
 * Returns a small acknowledgement (`{ ok, bytes, lines }`) rather than
 * echoing the content back — the model already has it. Line count is
 * useful so the model can confirm what was actually persisted (a
 * "wrote 1 line" reply when 100 were expected catches truncation bugs).
 */
// oxlint-disable-next-line sort-keys -- semantic field order: name, desc, params, call
export const writeTool = defineTool({
  name: "write",
  desc:
    "Write content to a file. Overwrites existing files; creates parent " +
    "directories as needed. Returns the byte count and line count of the " +
    "written file.",
  // oxlint-disable-next-line sort-keys -- semantic param order
  params: Type.Object({
    path: Type.String({ description: "Path to the file. Absolute or cwd-relative." }),
    content: Type.String({ description: "File contents to write, verbatim." }),
  }),

  async call(args): Promise<{ ok: true; path: string; bytes: number; lines: number }> {
    const path = resolve(args.path)

    try {
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, args.content, "utf8")
    } catch (error) {
      throw new ToolError({
        cause: error,
        code: "WRITE_FAILED",
        message: `failed to write ${path}: ${error instanceof Error ? error.message : String(error)}`,
      })
    }

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
