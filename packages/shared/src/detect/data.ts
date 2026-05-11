import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { resolve } from "pathe"
import { hash, safeFn } from "../utils.ts"

export type FileData = {
  data: Uint8Array
  /** On-disk path, when the source resolved to a local file. */
  path?: string
  /** Source URL, when the source was an http(s) URL or file URI. */
  url?: string
  hash?: string
  mime?: string
  base64?: string
}

export type FileSource = Partial<FileData> &
  ({ data: Uint8Array } | { path: string } | { url: string } | { base64: string })

function toSource(src: string): FileSource {
  const [, mime, base64] = src.match(/^data:([^;]+);base64,(.+)$/) ?? []
  if (mime && base64) return { base64, mime, url: src }
  if (/^https?:\/\//i.test(src)) return { url: src }
  if (src.startsWith("file://")) {
    const path = safeFn(() => fileURLToPath(src))()
    return { path: path ? resolve(path) : undefined, url: src }
  }
  return { path: resolve(src) }
}

export async function fileData(source: string | FileSource): Promise<FileData | undefined> {
  const src = typeof source === "string" ? toSource(source) : { ...source }

  src.data ??= src.base64 ? Buffer.from(src.base64, "base64") : undefined
  src.data ??= src.path ? await readFile(src.path).catch(() => undefined) : undefined

  // http(s) URL — fetched only when no other source produced bytes.
  if (!src.data && src.url && /^https?:\/\//i.test(src.url)) {
    const res = await fetch(src.url).catch(() => undefined)
    if (!res || !res.ok) return undefined
    src.data = new Uint8Array(await res.arrayBuffer())
    src.mime ??= res.headers.get("content-type") ?? undefined
  }

  return src.data ? { ...src, data: src.data } : undefined
}

// oxlint-disable-next-line typescript/no-unnecessary-type-parameters
export function fileHash<T extends { data: Uint8Array; hash?: string }>(file: T): string {
  return (file.hash ??= hash(file.data))
}

/**
 * Threshold-based binary heuristic.
 *
 *  - **NUL bytes** are conclusive — text files essentially never
 *    contain them, so a single NUL means binary, full stop.
 *  - **Control bytes** (other than TAB, LF, CR) are *suspicious* but
 *    not conclusive. Logs with ANSI styling, source files with form
 *    feeds, and assorted text artifacts can carry stray ones. Count
 *    them and treat the file as binary only when their share of the
 *    sampled bytes exceeds `threshold`.
 *
 *  Default threshold is 5% — generous enough to admit lightly-encoded
 *  text while catching real binary content (executables, archives)
 *  reliably. Sample size caps the work at the first 8 KB.
 */
export function isBinaryData(data: Uint8Array, threshold = 0.05): boolean {
  const sample = data.subarray(0, 8192)
  if (sample.length === 0) return false
  let bad = 0
  for (const b of sample) {
    if (b === 0) return true
    // Control chars excluding TAB (9), LF (10), CR (13). DEL (127) too.
    if (b < 9 || (b > 13 && b < 32) || b === 127) bad++
  }
  return bad / sample.length > threshold
}
