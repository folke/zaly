import type { DetectedImage, ImageFormat } from "./detect.ts"

import { imageMeta } from "image-meta"
import { imageDetect } from "./detect.ts"

/** Source-image metadata used for layout + format dispatch. */
export type ImageInfo<T extends ImageFormat = ImageFormat> = DetectedImage<T> & {
  width: number
  height: number
}

/** Detect format + read pixel dimensions via image-meta. Works on
 *  PNG/JPEG/GIF/WebP/AVIF/HEIC/PSD/PNM and a few others. Returns
 *  `undefined` if the source can't be detected; throws if dimensions
 *  can't be read from a detected image (corrupted/truncated header). */
export async function imageInfo(src: string): Promise<ImageInfo | undefined> {
  const img = await imageDetect(src)
  if (!img) return undefined
  const meta = imageMeta(img.data)
  if (meta.width === undefined || meta.height === undefined) {
    throw new Error(`Could not read image dimensions: ${src}`)
  }
  return { ...img, height: meta.height, width: meta.width }
}
