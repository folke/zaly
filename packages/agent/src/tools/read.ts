import type { Attachment, ImagePart, TextPart } from "@zaly/ai"
import type { ImageInfo } from "@zaly/shared"

import { defineTool, ToolError } from "@zaly/ai"
import { imageConvert, imageInfo } from "@zaly/shared"
import { readFile, stat } from "node:fs/promises"
import { resolve } from "pathe"
import { Type } from "typebox"

/**
 * Read a file from disk.
 *
 * Output shape:
 *   - Text files → numbered lines, `cat -n` style (6-char padded number,
 *     tab, content). Line numbers reflect the absolute line in the file
 *     even when reading a slice via `offset`/`limit`.
 *   - Image files (png, jpeg, webp, gif, avif, …) → `ImagePart` attachment.
 *     The model sees the image natively if its modality supports it.
 *   - Other binary files → `BINARY_FILE` error with a hint.
 *
 * Path resolution: relative paths resolve against the agent's session
 * cwd via `process.cwd()` for now. When the permission system gates this
 * via a tool-side hook, the cwd from `PermissionContext` will be used
 * instead so resolution stays consistent across the loop.
 */
const DEFAULT_LIMIT = 2000
const MAX_LINE_LENGTH = 2000
const BINARY_SAMPLE_BYTES = 8192

// Null byte + control chars excluding tab (9), LF (10), CR (13).
const BINARY_BYTE_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F]/

// oxlint-disable-next-line sort-keys -- semantic field order: name, desc, params, call
export const readTool = defineTool({
  name: "read",
  desc:
    "Read a file. Text files return numbered lines (`cat -n` style). " +
    "Image files return as image attachments. " +
    "Use `offset`/`limit` to slice large files (default limit: 2000 lines).",
  // oxlint-disable-next-line sort-keys -- semantic param order
  params: Type.Object({
    path: Type.String({ description: "Path to the file. Absolute or cwd-relative." }),
    offset: Type.Optional(
      Type.Integer({
        description: "1-based line number to start at. Defaults to 1.",
        minimum: 1,
      })
    ),
    limit: Type.Optional(
      Type.Integer({
        description: `Maximum number of lines to return. Defaults to ${DEFAULT_LIMIT}.`,
        minimum: 1,
      })
    ),
  }),

  async call(args): Promise<string | (TextPart | Attachment)[]> {
    const path = resolve(args.path)

    const fileStat = await stat(path).catch((error: unknown) => {
      throw new ToolError({
        cause: error,
        code: "NOT_FOUND",
        message: `cannot read ${path}: file not found`,
      })
    })
    if (!fileStat.isFile()) {
      throw new ToolError({ code: "NOT_A_FILE", message: `${path} is not a regular file` })
    }

    const data = await readFile(path)

    // Binary check — sample the first N bytes so huge files don't pay the
    // full scan. If it looks binary, branch to image detection or error.
    const sample = data.subarray(0, BINARY_SAMPLE_BYTES).toString("utf8")
    if (BINARY_BYTE_RE.test(sample)) {
      const info = await imageInfo(path)
      if (info !== undefined) {
        // Provider adapters accept a small set of mimes; convert any
        // detected image into one of them. No-op if already supported.
        const ready = await imageConvert(info, ["png", "jpeg", "webp"])
        if (ready !== undefined) return [toImagePart(ready)]
      }
      throw new ToolError({
        code: "BINARY_FILE",
        data: { bytes: data.length, path },
        message: `${path}: binary file (${data.length} bytes); not displayable as text`,
      })
    }

    return formatTextSlice(data.toString("utf8"), args.offset ?? 1, args.limit ?? DEFAULT_LIMIT)
  },
})

function formatTextSlice(content: string, offset: number, limit: number): string {
  const lines = content.split("\n")
  // `split` on a final newline produces a trailing empty string — drop
  // it so a 3-line file with trailing LF reads as 3 lines, not 4.
  if (lines.at(-1) === "") lines.pop()

  const start = offset - 1
  const end = Math.min(lines.length, start + limit)
  if (start >= lines.length) {
    return `(file has ${lines.length} lines; offset ${offset} is past end)`
  }

  const out: string[] = []
  for (let i = start; i < end; i++) {
    const lineNo = (i + 1).toString().padStart(6, " ")
    let line = lines[i]
    if (line.length > MAX_LINE_LENGTH) {
      line = `${line.slice(0, MAX_LINE_LENGTH)}… [line truncated, ${line.length} chars]`
    }
    out.push(`${lineNo}\t${line}`)
  }

  if (end < lines.length) {
    out.push(`(showing ${start + 1}-${end} of ${lines.length} lines; pass offset/limit for more)`)
  }
  return out.join("\n")
}

/** Wrap a converted image as an `ImagePart`. Format is one of the three
 *  supported by `imageConvert`'s target set, mapped to its MIME type. */
function toImagePart(img: ImageInfo<"jpeg" | "webp" | "png">): ImagePart {
  const mime = ({ jpeg: "image/jpeg", png: "image/png", webp: "image/webp" } as const)[img.format]
  return {
    mime,
    source: { data: Buffer.from(img.data).toString("base64"), type: "base64" },
    type: "image",
  }
}
