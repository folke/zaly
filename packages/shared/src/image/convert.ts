import type sharpType from "sharp"
import type { ImageFormat } from "../detect/index.ts"
import type { ImageInfo } from "./info.ts"

import { writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "pathe"
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

/** Convert an image to one of the requested formats. If the source is
 *  already in one of the requested formats, returns it unchanged. The
 *  converted output is cached on disk in `tmpdir`, keyed by content
 *  hash, so repeat calls across processes reuse the same file. */
export async function imageConvert<T extends WritableFormat>(
  img: ImageInfo,
  format: T | [T, ...T[]]
): Promise<ImageInfo<T> | undefined> {
  const formats = Array.isArray(format) ? format : [format]

  if (formats.includes(img.format as T)) return img as ImageInfo<T>

  const hash = fileHash(img)
  const target = formats[0]
  const tempPath = join(tmpdir(), `zaly-image-${hash}.${target}`)

  if (safeStat(tempPath)?.isFile()) {
    // Reuse the cached converted file. We synthesise a `DetectedImage`
    // shape directly — no need to re-fetch via the orchestrator since
    // we already know the format and have the path.
    const data = await readCached(tempPath)
    if (data === undefined) return undefined
    return imageInfo({ data, format: target, path: tempPath, type: "image" })
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

async function readCached(path: string): Promise<Uint8Array | undefined> {
  const { readFile } = await import("node:fs/promises")
  return readFile(path).catch(() => undefined)
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
