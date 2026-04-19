import type sharpType from "sharp"

import { createHash } from "node:crypto"
import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { imageMeta } from "image-meta"

/** Source-image metadata used for layout + format dispatch. */
export interface ImageMetadata {
  width: number
  height: number
  /** Format as reported by image-meta: "png", "jpg", "gif", "webp", ... */
  type: string | undefined
}

/**
 * A source resolved to an absolute PNG path on the local filesystem —
 * the shape KGP wants for `t=f`. Non-PNG sources get one-shot converted
 * via sharp into a cached temp PNG.
 */
export interface PngPath {
  path: string
  width: number
  height: number
}

const metaCache = new Map<string, Promise<ImageMetadata>>()
const pngPathCache = new Map<string, Promise<PngPath>>()
const bytesCache = new Map<string, Promise<Uint8Array>>()

// sharp is only needed when we have to convert a non-PNG to PNG. Both
// its ESM graph and its native binding are heavy (~50ms cold), so we
// defer loading until the conversion path actually fires.
async function getSharp(): Promise<typeof sharpType> {
  const mod = await import("sharp")
  return mod.default
}

/** Read dims + format via image-meta. Works on PNG/JPEG/GIF/WebP/AVIF/... */
export function imageMetadata(src: string): Promise<ImageMetadata> {
  let hit = metaCache.get(src)
  if (hit === undefined) {
    hit = loadMetadata(src)
    metaCache.set(src, hit)
  }
  return hit
}

async function loadMetadata(src: string): Promise<ImageMetadata> {
  // image-meta only looks at file headers — reading a small prefix is
  // enough for every format we care about, and keeps us from slurping a
  // 5MB wallpaper just to learn it's 2912×1632.
  const bytes = await readHeader(src)
  const meta = imageMeta(bytes)
  if (meta.width === undefined || meta.height === undefined) {
    throw new Error(`Could not read image dimensions: ${src}`)
  }
  return { height: meta.height, type: meta.type, width: meta.width }
}

async function readHeader(src: string): Promise<Uint8Array> {
  // 64KB covers PNG (24 bytes), JPEG (varies but fits), WebP (~4KB), AVIF
  // (metadata can be farther in but 64KB is safe for typical producers).
  // Falls back to the full file on tiny images.
  const buf = await readFile(src)
  return buf.length <= 65_536 ? buf : buf.subarray(0, 65_536)
}

/**
 * Resolve `src` to an absolute PNG path for KGP. PNG sources pass
 * through; others get converted once per process to a temp file and
 * cached by src path. The temp filename includes `tty-graphics-protocol`
 * per the KGP cleanup convention.
 */
export function pngPath(src: string): Promise<PngPath> {
  let hit = pngPathCache.get(src)
  if (hit === undefined) {
    hit = resolvePng(src)
    pngPathCache.set(src, hit)
  }
  return hit
}

async function resolvePng(src: string): Promise<PngPath> {
  const meta = await imageMetadata(src)
  const abs = resolve(src)
  if (meta.type === "png") return { height: meta.height, path: abs, width: meta.width }

  const key = createHash("sha256").update(abs).digest("hex").slice(0, 16)
  const tempPath = join(tmpdir(), `zaly-tty-graphics-protocol-${key}.png`)
  if (!existsSync(tempPath)) {
    const sharp = await getSharp()
    await sharp(src).png().toFile(tempPath)
  }
  return { height: meta.height, path: tempPath, width: meta.width }
}

/**
 * Read the raw source bytes. For iTerm2 which accepts PNG/JPEG/GIF/WebP
 * inline with no server-side conversion — we just base64 these and ship.
 */
export function imageBytes(src: string): Promise<Uint8Array> {
  let hit = bytesCache.get(src)
  if (hit === undefined) {
    hit = readFile(src)
    bytesCache.set(src, hit)
  }
  return hit
}

/**
 * Read PNG bytes for KGP bytes-in-band (`t=d`) — used when the client and
 * terminal don't share a filesystem (SSH). Walks through `pngPath()` so
 * non-PNG sources get converted on the way.
 */
export async function pngBytes(src: string): Promise<Uint8Array> {
  const { path } = await pngPath(src)
  return readFile(path)
}

/** Drop all cached metadata + resolved paths + bytes. Mostly for tests. */
export function resetImageCache(): void {
  metaCache.clear()
  pngPathCache.clear()
  bytesCache.clear()
}
