import type { ToolContext } from "@zaly/ai"
import type { FileMeta } from "./read.ts"

import { defineTool, AiError } from "@zaly/ai"
import { normPath } from "@zaly/shared"
import { detectEol, normalizeEol } from "@zaly/shared/text"
import { readFile, writeFile, stat } from "node:fs/promises"
import { Type } from "typebox"
import { assertFresh } from "./read.ts"

export type EditTool = typeof editTool
export type EditToolMeta = FileMeta & {
  /** File content before any edit was applied. */
  original: string
  /** File content after all edits were applied — exactly what's now on disk. */
  content: string
}

/**
 * Apply one or more exact-text replacements to a file.
 *
 * Semantics:
 *   - All `oldText` matches are resolved against the *original* file
 *     content. Edits are not applied sequentially — so edit #1's
 *     `newText` cannot accidentally produce a match for edit #2's
 *     `oldText`.
 *   - Each `oldText` must occur exactly once in the file (uniqueness
 *     forces the model to disambiguate via context rather than guessing).
 *   - Edits must not overlap. Nearby changes should be combined into a
 *     single edit covering the surrounding block.
 *   - The file is rewritten atomically: either every edit applies
 *     cleanly or none do.
 *
 * Use `read` first to inspect the file. Keep `oldText` minimal but
 * uniquely identifying. For full-file rewrites, use `write` instead.
 */
// oxlint-disable-next-line sort-keys -- semantic field order: name, desc, params, call
export const editTool = defineTool({
  name: "edit",
  desc:
    "Apply one or more exact-text replacements to a file. All matches are " +
    "resolved against the original content (not sequentially), each `oldText` " +
    "must be unique in the file, and edits must not overlap. " +
    "Atomic: all-or-nothing.",
  // oxlint-disable-next-line sort-keys -- semantic param order
  params: Type.Object({
    path: Type.String({ description: "Path to the file. Absolute or cwd-relative." }),
    edits: Type.Array(
      // oxlint-disable-next-line sort-keys -- semantic order: oldText then newText
      Type.Object({
        oldText: Type.String({ description: "Exact text to find. Must occur once in the file." }),
        newText: Type.String({ description: "Replacement text." }),
      }),
      {
        description: "One or more edits to apply atomically.",
        minItems: 1,
      }
    ),
  }),

  async call(
    args,
    ctx: ToolContext<EditToolMeta>
  ): Promise<{ ok: true; path: string; bytes: number; lines: number; edits: number }> {
    const path = normPath(ctx.cwd, args.path)
    // Edits ride the `write` scope — they're mutations.
    await ctx.need?.("write", path)

    // Edit always requires freshness — the operation is content-aware,
    // so the model must have seen the current bytes.
    assertFresh(path, ctx)

    const original = await readFile(path, "utf8").catch((error: unknown) => {
      throw new AiError({
        cause: error,
        code: "FILE_NOT_FOUND",
        message: `cannot edit ${path}: file not found`,
      })
    })

    const updated = applyEdits(original, args.edits, path)
    await writeFile(path, updated, "utf8")
    const fstat = await stat(path)
    ctx.meta = { content: updated, kind: "edit", mtime: fstat.mtimeMs, original, path }

    const bytes = Buffer.byteLength(updated, "utf8")
    const lines = countLines(updated)
    return { bytes, edits: args.edits.length, lines, ok: true, path }
  },
})

interface EditSpec {
  oldText: string
  newText: string
}

/** Resolve all edit positions against `original`, validate uniqueness +
 *  non-overlap, then splice the replacements in.
 *
 *  Line-ending fidelity: the model always emits LF, but the file may be
 *  CRLF. We detect the file's eol once, then normalize each `oldText` /
 *  `newText` to that eol before matching/splicing. The result has the
 *  same line-ending style as the original file. */
function applyEdits(original: string, edits: readonly EditSpec[], path: string): string {
  const eol = detectEol({ path, text: original })
  // 1. Locate every oldText. Reject not-found and non-unique up-front so
  //    the model gets a precise error per failing edit rather than a
  //    "patch failed at line N" mystery.
  const matches: { start: number; end: number; newText: string; spec: EditSpec }[] = []
  for (const [i, edit] of edits.entries()) {
    const oldText = normalizeEol(edit.oldText, { eol })
    const newText = normalizeEol(edit.newText, { eol })
    if (oldText === "") {
      throw new AiError({
        code: "EMPTY_OLD_TEXT",
        data: { editIndex: i },
        message: `edit #${i}: oldText is empty (use \`write\` to create or fully replace a file)`,
      })
    }
    const first = original.indexOf(oldText)
    if (first === -1) {
      throw new AiError({
        code: "NOT_FOUND",
        data: { editIndex: i, path, snippet: preview(oldText) },
        message: `edit #${i}: oldText not found in ${path}`,
      })
    }
    const next = original.indexOf(oldText, first + 1)
    if (next !== -1) {
      throw new AiError({
        code: "NOT_UNIQUE",
        data: { editIndex: i, occurrences: countOccurrences(original, oldText), path },
        message:
          `edit #${i}: oldText matches multiple locations in ${path}. ` +
          `Add surrounding context to make it unique.`,
      })
    }
    matches.push({
      end: first + oldText.length,
      newText,
      spec: edit,
      start: first,
    })
  }

  // 2. Sort by start; verify no overlap. Equal start positions are
  //    impossible because oldText is unique.
  matches.sort((a, b) => a.start - b.start)
  for (let i = 1; i < matches.length; i++) {
    if (matches[i].start < matches[i - 1].end) {
      throw new AiError({
        code: "OVERLAP",
        data: { a: matches[i - 1], b: matches[i] },
        message:
          `edits overlap in ${path}. ` +
          `Combine adjacent changes into a single edit covering both.`,
      })
    }
  }

  // 3. Splice. Walk the original and emit untouched-prefix + replacement
  //    chunks; cheaper than N independent string replacements.
  const out: string[] = []
  let cursor = 0
  for (const m of matches) {
    out.push(original.slice(cursor, m.start), m.newText)
    cursor = m.end
  }
  out.push(original.slice(cursor))
  return out.join("")
}

/** Count lines the way an editor would — non-empty trailing line counts;
 *  a trailing newline doesn't add a phantom blank line. */
function countLines(content: string): number {
  if (content === "") return 0
  let n = 1
  for (const c of content) if (c === "\n") n++
  if (content.endsWith("\n")) n--
  return n
}

function countOccurrences(haystack: string, needle: string): number {
  let n = 0
  let from = 0
  for (;;) {
    const i = haystack.indexOf(needle, from)
    if (i === -1) return n
    n++
    from = i + needle.length
  }
}

function preview(text: string): string {
  const trimmed = text.trim().replaceAll(/\s+/g, " ")
  return trimmed.length > 80 ? `${trimmed.slice(0, 79)}…` : trimmed
}
