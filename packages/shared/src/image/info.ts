import type { DetectedImage, ImageFormat } from "../detect/index.ts"

import { imageMeta } from "image-meta"

/** Source-image metadata used for layout + format dispatch. Extends
 *  the `DetectedImage` shape (already-classified file + format) with
 *  pixel dimensions read by `image-meta`. */
export type ImageInfo<T extends ImageFormat = ImageFormat> = DetectedImage<T> & {
  width: number
  height: number
}

/** Read pixel dimensions from a detected image. Throws if the
 *  dimensions can't be parsed (corrupted/truncated header). Callers
 *  pre-classify via `fileDetect`; this function is the post-detection
 *  step that extends `DetectedImage` with `width`/`height`. */
export function imageInfo<T extends ImageFormat>(img: DetectedImage<T>): ImageInfo<T> {
  const meta = imageMeta(img.data)
  if (meta.width === undefined || meta.height === undefined) {
    const from = img.path ?? img.url ?? "unknown source"
    throw new Error(`Could not read image dimensions: ${from}`)
  }
  return { ...img, height: meta.height, width: meta.width }
}
