import type { Attachment, ImagePart, MetaPart, TextPart, ToolContext, ToolMeta } from "@zaly/ai"
import type { ImageInfo } from "@zaly/shared"

import { defineTool, ToolError } from "@zaly/ai"
import { imageConvert, imageInfo, safeStat } from "@zaly/shared"
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
    "Use `offset`/`limit` to slice large files.",
  parallel: true,
  // oxlint-disable-next-line sort-keys -- semantic param order
  params: Type.Object({
    path: Type.String({ description: "Path to the file. Absolute or cwd-relative." }),
    offset: Type.Integer({
      default: 1,
      description:
        "1-based line number to start at. Negative values count from " +
        "the end: -50 starts 50 lines before EOF (so `offset: -50` " +
        "with the default limit returns the last 50 lines, like " +
        "`tail -n 50`). `offset: -50, limit: 20` reads 20 lines " +
        "starting 50 from the end.",
    }),
    limit: Type.Integer({
      default: DEFAULT_LIMIT,
      description: "Maximum number of lines to return.",
      minimum: 1,
    }),
  }),

  async call(args, ctx): Promise<string | (TextPart | MetaPart | Attachment)[]> {
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

    // Record the read so the freshness tracker knows we've seen this
    // file's current bytes. write/edit consult this before mutating.
    trackFile({ kind: "read", mtime: fileStat.mtimeMs, path }, ctx)

    return formatTextSlice(data.toString("utf8"), {
      limit: args.limit,
      offset: args.offset,
      path,
    })
  },
})

declare module "@zaly/ai" {
  interface ToolMeta {
    file?: { path: string; mtime: number; kind: "read" | "write" | "edit" }
  }
}

export function trackFile(track: ToolMeta["file"], ctx: ToolContext): void {
  ctx.meta ??= {}
  ctx.meta.file = track
}

export function assertFresh(path: string, ctx: ToolContext) {
  path = resolve(path)
  const mtime = safeStat(path)?.mtimeMs
  if (mtime === undefined)
    throw new ToolError({ code: "NOT_FOUND", message: `${path}: file not found` })
  const messages = ctx.messages
  if (!messages) throw freshnessError(path, "NOT_READ")
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.role !== "tool") continue
    const freshness = m.content.find((p) => p.meta?.file?.path === path)?.meta?.file
    if (freshness?.mtime === mtime) return // Fresh! The file's mtime matches what we saw at read time.
    if (freshness !== undefined) throw freshnessError(path, "STALE")
  }
  throw freshnessError(path, "NOT_READ")
}

/** Build the canonical "you need to read this first" error. Used by
 *  `write` (existing files only) and `edit` (always). The `code` is
 *  stable so the model can branch on it; the message tells the model
 *  what to do next; `data.reason` distinguishes never-read vs
 *  changed-since-read for downstream renderers. */
export function freshnessError(path: string, reason: "NOT_READ" | "STALE"): ToolError {
  return new ToolError({
    code: "FILE_NOT_FRESH",
    data: { path, reason },
    message:
      reason === "NOT_READ"
        ? `${path}: read this file before mutating it.`
        : `${path}: file changed since last read. Re-read before mutating.`,
  })
}

interface FormatOpts {
  path: string
  offset: number
  limit: number
}

/** Format a slice of file content as numbered lines plus, when the
 *  slice doesn't cover the whole file, a `<truncation>` MetaPart with
 *  structured info. Untruncated reads return a plain string for the
 *  cleanest model surface. */
function formatTextSlice(
  content: string,
  { path, offset, limit }: FormatOpts
): string | (TextPart | MetaPart)[] {
  const lines = content.split("\n")
  // `split` on a final newline produces a trailing empty string — drop
  // it so a 3-line file with trailing LF reads as 3 lines, not 4.
  if (lines.at(-1) === "") lines.pop()

  // Negative offset = "from the end" — Python-slice / `tail -n` semantic.
  // `-1000` on a 30-line file clamps to 0 (read whole file) rather than
  // erroring; `0` is treated as `1` (head, off-by-one tolerance).
  const start =
    offset < 0 ? Math.max(0, lines.length + offset) : Math.max(0, offset - 1)
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

  const text = out.join("\n")
  const truncated = end < lines.length || start > 0

  if (!truncated) return text

  const meta: MetaPart = {
    data: {
      hint: "pass offset and limit to read more",
      path,
      showing: [start + 1, end],
      total: lines.length,
    },
    tag: "truncation",
    type: "meta",
  }
  return [meta, { text, type: "text" }]
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
