import type { DetectedImage } from "../detect/file.ts"
import type { ImageFormat } from "../detect/image.ts"

import { toError } from "../utils.ts"

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
export async function imageInfo<T extends ImageFormat>(
  img: DetectedImage<T>
): Promise<ImageInfo<T>> {
  const { imageMeta } = await import("image-meta")
  try {
    const meta = imageMeta(img.data)
    return { ...img, height: meta.height, width: meta.width }
  } catch (error) {
    const from = img.path ?? img.url ?? "unknown source"
    const err = toError(error)
    throw new Error(`Could not read image dimensions: ${from}:\n${err}`, { cause: error })
  }
}
