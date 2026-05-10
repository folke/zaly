import type { FileData, FileSource } from "../files.ts"
import type { ImageFormat } from "./image.ts"
import type { TextFormat } from "./text.ts"

import { fileData, isBinaryData } from "../files.ts"
import { imageDetector } from "./image.ts"
import { pdfDetector } from "./pdf.ts"
import { detectTextFormat } from "./text.ts"

// ── Generic detector contract ────────────────────────────────────────────

/** A single magic-byte signature: each part anchors a literal byte
 *  sequence (`b`) at offset `o` (default 0). All parts must match. */
export type MagicMatch = readonly { o?: number; b: string | readonly number[] }[]

/**
 * Config-driven file-type detector. Each per-type module declares one
 * of these; the generic `detect()` engine runs the standard
 * resolution chain (magic → custom → MIME → ext) so per-type code
 * stays declarative.
 *
 * Strictness is implicit: if a format has a `magic` entry, MIME and
 * extension *cannot* claim it on their own. Same protection the old
 * `MAGIC_FORMATS` set provided — corrupt-file spoofing can't sneak
 * `image/png` past byte sniffing.
 */
export interface FileTypeDetect<T extends string, F extends string> {
  type: T
  formats: readonly F[]
  /** Format → one or more magic-byte signatures. Implicitly strict:
   *  formats listed here can only be confirmed by magic bytes. */
  magic?: Partial<Record<F, readonly MagicMatch[]>>
  /** Extension (without leading dot, lowercase) → format. Aliases
   *  collapse here (`jpg → jpeg`, `htm → html`). */
  ext?: Partial<Record<string, F>>
  /** MIME-fragment (substring, lowercase) → format. Tolerant of
   *  vendor-prefixed and parameterised MIMEs (`image/x-png`,
   *  `image/png; charset=…` both hit `"png"`). */
  mime?: Partial<Record<string, F>>
  /** Bespoke byte-level fallback for formats that don't fit fixed
   *  magic patterns — ISOBMFF brand parsing (AVIF/HEIC), Netpbm
   *  variant dispatch, SVG text peek. Runs after magic, before
   *  MIME/ext. Formats it returns are also strict (no MIME/ext
   *  override). */
  custom?: (file: FileData) => F | undefined
}

/** Run a single detector against a file. Returns
 *  `{ type, format }` on a hit, `undefined` otherwise. */
export function detect<T extends string, F extends string>(
  cfg: FileTypeDetect<T, F>,
  file: FileData
): { type: T; format: F } | undefined {
  // 1. Magic — strict, byte-anchored.
  if (cfg.magic) {
    for (const fmt of Object.keys(cfg.magic) as F[]) {
      const sigs = cfg.magic[fmt]
      if (!sigs) continue
      for (const sig of sigs) {
        if (matchesMagic(file.data, sig)) return { format: fmt, type: cfg.type }
      }
    }
  }

  // 2. Custom — also byte-level. Result is strict by construction.
  const c = cfg.custom?.(file)
  if (c !== undefined) return { format: c, type: cfg.type }

  // Track which formats are "strict" (must be confirmed by bytes) so
  // MIME/ext fallbacks can't claim them when magic didn't hit.
  const isStrict = (f: F): boolean => Boolean(cfg.magic?.[f])

  // 3. MIME — substring match, fragments win first match.
  if (cfg.mime && file.mime) {
    const m = file.mime.toLowerCase()
    for (const key of Object.keys(cfg.mime)) {
      const f = cfg.mime[key]
      if (f !== undefined && m.includes(key) && !isStrict(f)) {
        return { format: f, type: cfg.type }
      }
    }
  }

  // 4. Extension — checks `path` first, then `url`'s pathname.
  if (cfg.ext) {
    const src = file.path ?? extractUrlPath(file.url)
    if (src !== undefined) {
      const dot = src.lastIndexOf(".")
      if (dot !== -1) {
        const ext = src.slice(dot + 1).toLowerCase()
        const f = cfg.ext[ext]
        if (f !== undefined && !isStrict(f)) return { format: f, type: cfg.type }
      }
    }
  }

  return undefined
}

// ── Orchestrator ─────────────────────────────────────────────────────────

/** Discriminated union of detected file types. Each variant carries
 *  the original `FileData` plus a `type` discriminator and a
 *  type-narrow `format`. */
export type DetectedFile =
  | (FileData & { type: "image"; format: ImageFormat })
  | (FileData & { type: "pdf"; format: "pdf" })
  | (FileData & { type: "text"; format: TextFormat })
  | (FileData & { type: "binary"; format: "unknown" })

/** Per-type narrowed views, for callers that already know the kind
 *  and just want the right shape. */
export type DetectedImage<T extends ImageFormat = ImageFormat> = FileData & {
  type: "image"
  format: T
}
export type DetectedPdf = FileData & { type: "pdf"; format: "pdf" }
export type DetectedText<T extends TextFormat = TextFormat> = FileData & {
  type: "text"
  format: T
}
export type DetectedBinary = FileData & { type: "binary"; format: "unknown" }

/** All `format` strings reachable from a `DetectedFile` of the given
 *  `type`. Drives the narrow second arg of `isFileFormat`. */
export type FormatOf<T extends DetectedFile["type"]> = Extract<DetectedFile, { type: T }>["format"]

/** Narrow a `DetectedFile` to the variant carrying `type`. Useful for
 *  walking over a heterogeneous list and switching by kind without
 *  manually destructuring a union. */
export function isFileType<T extends DetectedFile["type"]>(
  file: DetectedFile,
  type: T
): file is Extract<DetectedFile, { type: T }> {
  return file.type === type
}

/** Narrow a `DetectedFile` to a specific `(type, format)` pair. The
 *  second arg is constrained to formats valid for `type`, so calls
 *  like `isFileFormat(f, "image", "pdf")` are caught at compile time.
 *
 *  Note on narrowing: `Extract<DetectedFile, { type: "image" }>` keeps
 *  the variant's full `format: ImageFormat` (TS doesn't narrow inside
 *  a union constituent). Intersecting with `{ format: F }` collapses
 *  it to the literal — TS accepts the result as a subtype of the
 *  extracted variant, which is a subtype of `DetectedFile`. */
export function isFileFormat<T extends DetectedFile["type"], F extends FormatOf<T>>(
  file: DetectedFile,
  type: T,
  format: F
): file is Extract<DetectedFile, { type: T }> & { format: F } {
  return file.type === type && file.format === format
}

/**
 * Identify the type and format of a file from a source. Returns a
 * discriminated union — callers switch on `.type` and get the narrow
 * format. Returns `undefined` only when the bytes themselves couldn't
 * be fetched (missing file, fetch failure). Anything readable resolves
 * to one of the variants — including `binary` / unknown — so consumers
 * don't have to disambiguate "couldn't fetch" from "couldn't classify".
 *
 * Detector order: known binary formats (image, PDF) run first via the
 * generic engine; the text branch only fires when the bytes pass
 * `isBinaryData`'s threshold, so PDFs (mostly ASCII in their envelope)
 * don't get misclassified as text.
 */
export async function fileDetect(src: string | FileSource): Promise<DetectedFile | undefined> {
  const file = await fileData(src)
  if (!file) return undefined

  const image = detect(imageDetector, file)
  if (image) return { ...file, ...image }

  const pdf = detect(pdfDetector, file)
  if (pdf) return { ...file, ...pdf }

  if (!isBinaryData(file.data)) return { ...file, format: detectTextFormat(file), type: "text" }
  return { ...file, format: "unknown", type: "binary" }
}

// ── Internals ────────────────────────────────────────────────────────────

function matchesMagic(buf: Uint8Array, parts: MagicMatch): boolean {
  for (const { o = 0, b } of parts) {
    if (o + b.length > buf.length) return false
    for (let i = 0; i < b.length; i++) {
      const expected = typeof b === "string" ? b.charCodeAt(i) : b[i]
      if (buf[o + i] !== expected) return false
    }
  }
  return true
}

/** Pull the path component out of an `https?://` or `file://` URL.
 *  Falls back to the whole string for shapes the URL parser rejects.
 *  Used for ext fallback when only a `url` is set on a `FileData`. */
function extractUrlPath(url: string | undefined): string | undefined {
  if (url === undefined) return undefined
  try {
    return new URL(url).pathname
  } catch {
    return url
  }
}
