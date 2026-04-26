import type sharpType from "sharp"
import type { DetectedImage, ImageFormat } from "./detect.ts"

import { imageMeta } from "image-meta"
import { existsSync } from "node:fs"
import { writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { imageDetect, imageHash } from "./detect.ts"

/** Source-image metadata used for layout + format dispatch. */
export type ImageInfo<T extends ImageFormat = ImageFormat> = DetectedImage<T> & {
  width: number
  height: number
}

/** Formats sharp can *write*. PNG/JPEG/WebP/GIF/AVIF/TIFF/JP2 in default
 *  builds; HEIC output requires a licensed libheif build and is omitted
 *  on purpose (most sharp installs reject `heif({ compression: 'hevc' })`).
 */
const SHARP_WRITERS = {
  jpeg: (s: sharpType.Sharp) => s.jpeg(),
  png: (s: sharpType.Sharp) => s.png(),
  webp: (s: sharpType.Sharp) => s.webp(),
} as const satisfies Partial<Record<ImageFormat, (s: sharpType.Sharp) => sharpType.Sharp>>

type WritableFormat = keyof typeof SHARP_WRITERS

// sharp is only needed when we have to convert a non-PNG to PNG. Both
// its ESM graph and its native binding are heavy (~50ms cold), so we
// defer loading until the conversion path actually fires. `sharp` is
// also an `optionalDependencies` — throw a clear, actionable error
// when the user hits this path without having it installed.
async function getSharp(): Promise<typeof sharpType> {
  try {
    const mod = await import("sharp")
    return mod.default
  } catch {
    throw new Error(
      "@zaly/tui: `sharp` is required to render non-PNG images " +
        "(jpg, webp, gif). Install it with `bun add sharp` (or your " +
        "package manager's equivalent), or use PNG sources directly."
    )
  }
}

/** Read dims + format via image-meta. Works on PNG/JPEG/GIF/WebP/AVIF/... */
export async function imageInfo(src: string): Promise<ImageInfo | undefined> {
  const img = await imageDetect(src)
  if (!img) return undefined
  const meta = imageMeta(img.data)
  if (meta.width === undefined || meta.height === undefined) {
    throw new Error(`Could not read image dimensions: ${src}`)
  }
  return { ...img, height: meta.height, width: meta.width }
}

export async function imageConvert<T extends WritableFormat>(
  img: ImageInfo,
  format: T | [T, ...T[]]
): Promise<undefined | ImageInfo<T>> {
  const formats = Array.isArray(format) ? format : [format]

  if (formats.includes(img.format as T)) return img as ImageInfo<T>

  const hash = imageHash(img)
  const target = formats[0]
  const tempPath = join(tmpdir(), `zaly-image-${hash}.${target}`)

  if (existsSync(tempPath)) return (await imageInfo(tempPath)) as ImageInfo<T> | undefined

  const sharp = await getSharp()
  const pipeline = SHARP_WRITERS[target](sharp(img.data))
  const { data, info } = await pipeline.toBuffer({ resolveWithObject: true })

  await writeFile(tempPath, data)
  return { data, format: target, height: info.height, path: tempPath, width: info.width }
}
