/**
 * Kitty Graphics Protocol — local-file transmission + native placements.
 *
 * Flow:
 *  1. Transmit once per src via `transmitFile(id, path)` (t=f). The
 *     terminal loads the image bytes from the file path; nothing of the
 *     image is transmitted over the wire beyond the path itself.
 *  2. On every render, emit `placement(imgId, placeId, { cols, rows })`
 *     at the target cursor position. Re-sending a placement with the
 *     same (image id, placement id) moves/resizes the existing placement
 *     without flicker — ideal for re-renders.
 *
 * We don't use unicode placeholders: output goes directly to the native
 * terminal scrollback, so direct cursor-position placement is enough.
 *
 * Reference: https://sw.kovidgoyal.net/kitty/graphics-protocol/
 */

import type { ImageInfo } from "@zaly/shared/image"

const CHUNK_SIZE = 4096

/** Allocate a fresh 32-bit image id (1..0xFFFFFFFE). */
export function allocateImageId(): number {
  return Math.floor(Math.random() * 0xff_ff_ff_fd) + 1
}

/** Allocate a fresh 32-bit placement id. */
export function allocatePlacementId(): number {
  return Math.floor(Math.random() * 0xff_ff_ff_fd) + 1
}

// Per-src transmit cache. The first caller gets the full transmit
// sequence to prepend to their output; subsequent callers get "". The
// sync `sent` flag is set the moment a caller observes the resolved
// entry, so parallel renders don't both try to transmit.
interface CacheEntry {
  promise: Promise<{ id: number; seq: string }>
  sent: boolean
}
const transmitCache = new Map<string, CacheEntry>()

/**
 * Ensure an image has been transmitted to the terminal at least once.
 * On the first call per `src`, returns the full `a=t,t=f` escape to be
 * prepended to the caller's first row — the APC payload has zero display
 * width, so layout sees through it. Subsequent calls return `transmit:
 * ""` since the terminal already has the bytes under `imageId`.
 *
 * The caller is expected to combine this with `placement(...)` on every
 * render to actually paint the image at the right cell rectangle.
 */
export async function transmitOnce(
  info: ImageInfo
): Promise<{ imageId: number; transmit: string } | undefined> {
  const { fileHash } = await import("@zaly/shared/detect")
  const { isRemoteSession } = await import("./capabilities.ts")
  const key = fileHash(info)
  let entry = transmitCache.get(key)
  if (entry === undefined) {
    const { imageConvert } = await import("@zaly/shared/image")
    const png = await imageConvert(info, "png")
    if (!png) return undefined
    const promise = (async () => {
      const id = allocateImageId()
      // Under SSH the terminal can't read files on the local side, so
      // fall back to bytes-in-band (`t=d`). Locally we pass a path and
      // the transmit payload stays under 1KB.
      if (isRemoteSession() || !png.path) {
        return { id, seq: transmitBytes(id, png.data) }
      }
      return { id, seq: transmitFile(id, png.path) }
    })()
    entry = { promise, sent: false }
    transmitCache.set(key, entry)
  }
  const prep = await entry.promise
  if (entry.sent) return { imageId: prep.id, transmit: "" }
  entry.sent = true
  return { imageId: prep.id, transmit: prep.seq }
}

/** Drop the per-src transmit cache. Mostly for tests. */
export function resetTransmitCache(): void {
  transmitCache.clear()
}

export interface PlacementDims {
  /** Display width in terminal cells. */
  cols: number
  /** Display height in terminal cells. */
  rows: number
}

/**
 * Transmit an image to the terminal by file path (`t=f`). Near-zero cost
 * on the wire — the terminal opens and reads the file itself. `path`
 * must be absolute and must point to a regular file; symlinks are
 * followed by the terminal.
 */
export function transmitFile(id: number, path: string): string {
  const b64 = toBase64(new TextEncoder().encode(path))
  return `\x1b_Ga=t,f=100,t=f,i=${id},q=2;${b64}\x1b\\`
}

/**
 * Remote/bytes transmission fallback (`t=d`) for when the terminal can't
 * read local files — typical of SSH sessions. Base64-encodes and chunks
 * the PNG payload at 4KB boundaries per the protocol.
 */
export function transmitBytes(id: number, png: Uint8Array): string {
  const base64 = toBase64(png)
  const params = `a=t,f=100,i=${id},q=2`
  if (base64.length <= CHUNK_SIZE) return `\x1b_G${params};${base64}\x1b\\`
  const out: string[] = []
  let offset = 0
  let first = true
  while (offset < base64.length) {
    const chunk = base64.slice(offset, offset + CHUNK_SIZE)
    offset += CHUNK_SIZE
    const more = offset < base64.length ? 1 : 0
    const head = first ? `\x1b_G${params},m=${more};` : `\x1b_Gm=${more};`
    out.push(`${head}${chunk}\x1b\\`)
    first = false
  }
  return out.join("")
}

/**
 * Create or update a placement at the current cursor position. The image
 * is scaled into the `cols × rows` cell rectangle. `C=1` keeps the
 * cursor from moving, so the caller can continue filling text rows
 * normally (the image overlays whatever text occupies those cells).
 *
 * Sending a placement with an (i, p) pair that already exists replaces
 * the previous placement — the spec guarantees this is flicker-free.
 */
export function placement(imageId: number, placementId: number, dims: PlacementDims): string {
  return `\x1b_Ga=p,i=${imageId},p=${placementId},c=${dims.cols},r=${dims.rows},C=1,q=2\x1b\\`
}

/** Delete a placement (keeps image data so it can be re-placed cheaply). */
export function deletePlacement(imageId: number, placementId: number): string {
  return `\x1b_Ga=d,d=i,i=${imageId},p=${placementId},q=2\x1b\\`
}

/** Delete an image and its placements, also freeing the pixel data. */
export function deleteImage(id: number): string {
  return `\x1b_Ga=d,d=I,i=${id},q=2\x1b\\`
}

/** Delete every placement on screen (doesn't free image data). */
export function deleteAllImages(): string {
  return `\x1b_Ga=d,d=A,q=2\x1b\\`
}

function toBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64")
  let binary = ""
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

export function bumpPlacements(
  rows: string[]
): undefined | { delete: () => string; rows: string[] } {
  const placements: { i: number; p: number }[] = []
  const ret = rows.map((row) =>
    row.replace(/\x1b_Ga=p,i=(\d+),p=(\d+)/g, (_, i) => {
      const imageId = parseInt(i, 10)
      const placementId = allocatePlacementId()
      placements.push({ i: imageId, p: placementId })
      return `\x1b_Ga=p,i=${imageId},p=${placementId}`
    })
  )
  if (!placements.length) return
  return { delete: () => placements.map((p) => deletePlacement(p.i, p.p)).join(""), rows: ret }
}
