// oxlint-disable no-await-in-loop
import type sharpType from "sharp"
import type { PngOptions } from "sharp"
import type { DetectedFile, DetectedImage } from "../detect/file.ts"
import type { ImageFormat } from "../detect/image.ts"
import type { ImageInfo } from "./info.ts"

import { writeFile, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "pathe"
import { fileDetect } from "../detect/file.ts"
import { fileHash } from "../files.ts"
import { safeStat } from "../utils.ts"
import { imageInfo } from "./info.ts"

/** Formats sharp can *write*. PNG/JPEG/WebP/GIF/AVIF/TIFF/JP2 in default
 *  builds; HEIC output requires a licensed libheif build and is omitted
 *  on purpose (most sharp installs reject `heif({ compression: 'hevc' })`).
 */
const SHARP_WRITERS = {
  jpeg: (s: sharpType.Sharp) => s.jpeg(),
  png: (s: sharpType.Sharp) => s.png(),
  webp: (s: sharpType.Sharp) => s.webp(),
} as const satisfies Partial<Record<ImageFormat, (s: sharpType.Sharp) => sharpType.Sharp>>

export type WritableFormat = keyof typeof SHARP_WRITERS

export function isWritable(img: DetectedFile): img is DetectedImage<WritableFormat> {
  return img.type === "image" && img.format in SHARP_WRITERS
}

/** Convert an image to one of the requested formats. If the source is
 *  already in one of the requested formats, returns it unchanged. The
 *  converted output is cached on disk in `tmpdir`, keyed by content
 *  hash, so repeat calls across processes reuse the same file. */
export async function imageConvert<T extends WritableFormat>(
  img: DetectedImage,
  format: T | [T, ...T[]]
): Promise<ImageInfo<T> | DetectedImage<T> | undefined> {
  const formats = Array.isArray(format) ? format : [format]

  if (formats.includes(img.format as T)) return img as DetectedImage<T>

  const hash = fileHash(img)
  const target = formats[0]
  const tempPath = join(tmpdir(), `zaly-image-${hash}.${target}`)

  if (safeStat(tempPath)?.isFile()) {
    // Reuse the cached converted file. We synthesise a `DetectedImage`
    // shape directly — no need to re-fetch via the orchestrator since
    // we already know the format and have the path.
    const data = await readFile(tempPath).catch(() => undefined)
    if (data === undefined) return
    return await imageInfo({ data, format: target, path: tempPath, type: "image" })
  }

  const sharp = await getSharp()
  const pipeline = SHARP_WRITERS[target](sharp(img.data))
  const { data, info } = await pipeline.toBuffer({ resolveWithObject: true })

  await writeFile(tempPath, data)
  return {
    data,
    format: target,
    height: info.height,
    path: tempPath,
    type: "image",
    width: info.width,
  }
}

/** Re-encode an image to fit a size budget. Resizes to `maxDimension`
 *  on the longest edge, then encodes via a tiered strategy:
 *
 *    - **Alpha source**: try PNG lossless (`compressionLevel: 9`), then
 *      palette quantized at quality 80, then quality 50. Each step
 *      preserves transparency. If none fit, fall through to JPEG.
 *    - **No alpha (or PNG path exhausted)**: JPEG with iterative
 *      quality step-down from `quality` toward 30 until under budget.
 *      The fall-through case loses transparency — better to ship a
 *      flattened image than fail the wire send on a hard provider cap.
 *
 *  No-op fast path: if the source is already in `jpeg`/`png`/`webp`
 *  and already within `maxBytes`, returns it unchanged (skips the
 *  sharp load entirely).
 *
 *  Cached on disk by content hash + opts. The cache key deliberately
 *  excludes the output format (which is an outcome of the algorithm,
 *  not an input) so a stable hash means a stable cache hit; format is
 *  recovered from the bytes via `fileDetect` on read.
 *
 *  Used by provider pipelines to keep image payloads under per-provider
 *  size caps (Anthropic: 5 MB; we cap OpenAI at the same default since
 *  its 512 MB ceiling is excessive in practice). */
export async function imageCompress(
  img: DetectedImage,
  opts: CompressOpts = {}
): Promise<DetectedImage<"jpeg" | "png" | "webp">> {
  const maxBytes = opts.maxBytes ?? 5 * 1024 * 1024
  const maxDimension = opts.maxDimension ?? 2048
  const quality = opts.quality ?? 85

  // Cheap path: already small + acceptable format → no sharp needed.
  // We don't check dimensions here because reading them requires
  // loading sharp + parsing the image, and at this point we know the
  // bytes are within the size budget anyway. A small file with
  // unusually large dimensions slips through; that's acceptable.
  if (isWritable(img) && img.data.length <= maxBytes) return img

  const cacheKey = `${fileHash(img)}-d${maxDimension}-q${quality}-b${maxBytes}`
  const tempPath = join(tmpdir(), `zaly-image-compress-${cacheKey}`) // no file extension since we might change formats on conversion
  if (safeStat(tempPath)?.isFile()) {
    const ret = await fileDetect({ path: tempPath })
    if (ret && isWritable(ret)) return ret
  }

  const sharp = await getSharp()
  const meta = await sharp(img.data).metadata()
  const longest = Math.max(meta.width, meta.height)
  let format: "jpeg" | "png" = meta.hasAlpha ? "png" : "jpeg"

  let data = img.data

  const pipeline = sharp(img.data)

  // resize
  if (longest > maxDimension)
    pipeline.resize({ fit: "inside" as const, height: maxDimension, width: maxDimension })

  // try to compress while preserving the alpha channel (if any) first
  if (format === "png") {
    const steps: PngOptions[] = [
      { compressionLevel: 9 },
      { palette: true, quality: 80 },
      { palette: true, quality: 50 },
    ]
    for (const step of steps) {
      data = await pipeline.clone().png(step).toBuffer()
      if (data.length <= maxBytes) break
    }
  }

  if (data.length > maxBytes || format === "jpeg") {
    for (let q = quality; q >= 30; q -= 15) {
      format = "jpeg"
      data = await pipeline.clone().jpeg({ quality: q }).toBuffer()
      if (data.length <= maxBytes) break
    }
  }

  await writeFile(tempPath, data)
  return { data, format, path: tempPath, type: "image" }
}

export interface CompressOpts {
  /** Cap on output bytes. Default 5 MB. Alpha sources first try PNG
   *  (lossless → palette-quantized at q=80 → q=50); if none fit, the
   *  image is flattened and JPEG-encoded with quality step-down.
   *  Non-alpha sources go straight to JPEG with quality step-down. */
  maxBytes?: number
  /** Cap on the longest edge in pixels. Default 2048. */
  maxDimension?: number
  /** Initial JPEG quality. Default 85. Iteratively reduced toward 30
   *  in 15-point steps when the encoded output exceeds `maxBytes`. */
  quality?: number
}

// sharp is only needed when we have to convert. Both its ESM graph and
// its native binding are heavy (~50ms cold), so we defer loading until
// the conversion path actually fires. `sharp` is also an
// `optionalDependencies` — throw a clear, actionable error when the user
// hits this path without having it installed.
async function getSharp(): Promise<typeof sharpType> {
  try {
    const mod = await import("sharp")
    return mod.default
  } catch {
    throw new Error(
      "@zaly/shared: `sharp` is required to convert images. Install it " +
        "with `bun add sharp` (or your package manager's equivalent)."
    )
  }
}
