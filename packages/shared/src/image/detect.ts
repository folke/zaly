import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { resolve } from "pathe"
import { hash, safeFn } from "../utils.ts"

export type ImageFormat = (typeof formats)[number]

export type DetectedImage<T extends ImageFormat = ImageFormat> = {
  format: T
  data: Uint8Array
  /** On-disk path, when the source resolved to a local file. */
  path?: string
  /** Source URL, when the source was an http(s) URL or file URI. */
  url?: string
  hash?: string
  mime?: string
}

// oxfmt-ignore
const formats = [
  "png", "jpeg", "gif", "webp", "avif", "heic", "svg", "bmp", "tiff", "ico", "jxl", "tga", "psd", "pbm", "pgm",
  "ppm", "pnm", "pam", "raw", "arw", "cr2", "cr3", "nef", "nrw", "orf", "raf", "rw2", "dng", "pcx", "xpm", "xbm",
  "jp2", "j2c", "icns", "dds", "ktx",
] as const

const extFormats: Partial<Record<string, ImageFormat>> = {
  apng: "png",
  avifs: "avif",
  cur: "ico",
  dib: "bmp",
  heif: "heic",
  hif: "heic",
  icb: "tga",
  j2k: "j2c", // JPEG 2000 codestream variant
  jfif: "jpeg",
  jpc: "j2c", // JPEG 2000 codestream
  jpe: "jpeg",
  jpf: "jp2", // JPEG 2000 Part 2 (extended)
  jpg: "jpeg",
  jpm: "jp2", // JPEG 2000 mixed-mode
  jpx: "jp2", // JPEG 2000 Part 2
  ktx2: "ktx",
  pjp: "jpeg",
  pjpeg: "jpeg",
  psb: "psd",
  svgz: "svg",
  targa: "tga",
  tif: "tiff",
  vda: "tga",
  vst: "tga",
}

/** ISOBMFF major brands that identify a HEIC/HEIF file. Sequence
 *  (`-sequence`) and image-collection (`mif1` / `msf1`) variants are
 *  treated the same — they're all served by HEIC decoders. */
// oxfmt-ignore
const HEIC_BRANDS = new Set([
  "heic", "heix", "heim", "heis",
  "hevc", "hevx", "hevm", "hevs",
  "mif1", "msf1",
])

/** Magic-byte signatures. `b` is the literal byte sequence at offset
 *  `o` (default 0) — strings are matched as ASCII. Multi-part entries
 *  (e.g. WebP needs `RIFF` at 0 *and* `WEBP` at 8) chain `parts`. */
type Magic = { format: ImageFormat; parts: { o?: number; b: string | number[] }[] }

// oxfmt-ignore
const MAGIC: Magic[] = [
  { format: "png",  parts: [{ b: [0x89, 0x50, 0x4e, 0x47] }] },
  { format: "jpeg", parts: [{ b: [0xff, 0xd8, 0xff] }] },
  { format: "gif",  parts: [{ b: "GIF8" }] },
  { format: "bmp",  parts: [{ b: "BM" }] },
  // TIFF: little-endian (`II*\0`) or big-endian (`MM\0*`). Many camera
  // RAW formats are TIFF-based and surface here as `tiff` — expected.
  { format: "tiff", parts: [{ b: "II*\0" }] },
  { format: "tiff", parts: [{ b: "MM\0*" }] },
  // ICO: 00 00 01 00 — CUR uses 00 00 02 00 and is treated as the same family.
  { format: "ico",  parts: [{ b: [0x00, 0x00, 0x01, 0x00] }] },
  { format: "ico",  parts: [{ b: [0x00, 0x00, 0x02, 0x00] }] },
  { format: "psd",  parts: [{ b: "8BPS" }] },
  { format: "webp", parts: [{ b: "RIFF" }, { b: "WEBP", o: 8 }] },
  // JPEG XL — codestream (FF 0A) and container (...JXL signature box).
  { format: "jxl",  parts: [{ b: [0xff, 0x0a] }] },
  { format: "jxl",  parts: [{ b: [0x00, 0x00, 0x00, 0x0c] }, { b: "JXL ", o: 4 }] },
  // JPEG 2000 — file (signature box) and bare codestream.
  { format: "jp2",  parts: [{ b: [0x00, 0x00, 0x00, 0x0c, 0x6a, 0x50, 0x20, 0x20, 0x0d, 0x0a, 0x87, 0x0a] }] },
  { format: "j2c",  parts: [{ b: [0xff, 0x4f, 0xff, 0x51] }] },
  // Apple Icon Image (macOS .icns).
  { format: "icns", parts: [{ b: "icns" }] },
  // DirectDraw Surface (DirectX texture).
  { format: "dds",  parts: [{ b: "DDS " }] },
  // Khronos Texture — KTX1 and KTX2 share a 12-byte signature with version
  // bytes at 5..6 ('11' or '20').
  { format: "ktx",  parts: [{ b: [0xab, 0x4b, 0x54, 0x58, 0x20, 0x31, 0x31, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a] }] },
  { format: "ktx",  parts: [{ b: [0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a] }] },
]

/** Netpbm subtype dispatch — byte 0 is `'P'`, byte 1 selects the variant.
 *  Pairs are ASCII / binary forms of the same format (P1/P4, P2/P5, P3/P6). */
// oxfmt-ignore
const NETPBM: Partial<Record<number, ImageFormat>> = {
  0x31: "pbm", 0x32: "pgm",
  0x33: "ppm", 0x34: "pbm",
  0x35: "pgm", 0x36: "ppm",
  0x37: "pam",
}

/** Formats whose magic bytes we sniff. If extension says one of these
 *  but the bytes didn't match, the file is corrupt/truncated/empty —
 *  reject in `fromExt` rather than handing bad bytes downstream. */
// oxfmt-ignore
const MAGIC_FORMATS = new Set<ImageFormat>([
  ...MAGIC.map((m) => m.format),
  "avif", "heic",              // ISOBMFF dispatch
  "pbm", "pgm", "ppm", "pam",  // Netpbm dispatch
  "svg",                        // text dispatch
])

const formatSet = new Set(formats)
type ImageData = Omit<DetectedImage, "format">

export function imageHash(img: DetectedImage): string {
  return (img.hash ??= hash(img.data).slice(0, 16))
}

export function isImageFormat(format?: string): format is ImageFormat {
  return formatSet.has(format as ImageFormat)
}

/** Returns true when format exists and falls outside the magic-byte-detectable
/*  set — i.e. when MIME/extension is the only way to identify it. */
function isSpecialFormat(format?: string): format is ImageFormat {
  return isImageFormat(format) && !MAGIC_FORMATS.has(format)
}

async function imageData(src: string): Promise<ImageData | undefined> {
  // data URL: data:[<mime type>][;base64],<data>
  const [, mime, b64] = src.match(/^data:([^;]+);base64,(.+)$/) ?? []
  if (mime && b64) return { data: Buffer.from(b64, "base64"), mime }

  // http(s) URL
  if (/^https?:\/\//i.test(src)) {
    const res = await fetch(src).catch(() => undefined)
    if (!res || !res.ok) return undefined
    const data = new Uint8Array(await res.arrayBuffer())
    return { data, mime: res.headers.get("content-type") ?? undefined, url: src }
  }

  // file URL: file:///path/to/image.png
  if (src.startsWith("file://")) {
    let path = safeFn(() => fileURLToPath(src))()
    path = path ? resolve(path) : undefined
    const data = path ? await readFile(path).catch(() => undefined) : undefined
    return data ? { data, path, url: src } : undefined
  }

  // Local file path
  src = resolve(src)
  const data = await readFile(src).catch(() => undefined)
  return data ? { data, path: src } : undefined
}

export async function imageDetect(src: string): Promise<DetectedImage | undefined> {
  const img = await imageData(src)
  if (!img) return
  let format = fromData(img.data)
  format ??= img.mime ? fromMime(img.mime) : undefined
  format ??= img.path ? fromExt(img.path) : undefined
  return format ? { ...img, format } : undefined
}

function fromMime(mime: string): ImageFormat | undefined {
  const guessed = mime
    .match(/^[^/]+\/(?:x-)?([^+;\s]+)/i)?.[1]
    .toLowerCase()
    .replace(/^vnd\.[^.]+\./, "")
  return isSpecialFormat(guessed) ? guessed : undefined
}

function fromExt(path: string): ImageFormat | undefined {
  const dot = path.lastIndexOf(".")
  if (dot === -1) return undefined
  const ext = path.slice(dot + 1).toLowerCase()
  const format = extFormats[ext] ?? ext
  return isSpecialFormat(format) ? format : undefined
}

function matches(buf: Uint8Array, parts: Magic["parts"]): boolean {
  return parts.every(({ o = 0, b }) => {
    if (o + b.length > buf.length) return false
    for (let i = 0; i < b.length; i++) {
      const expected = typeof b === "string" ? b.charCodeAt(i) : b[i]
      if (buf[o + i] !== expected) return false
    }
    return true
  })
}

/** Identify an image format from the first bytes of a file. Returns
 *  `undefined` for formats with no reliable signature (TGA, most camera
 *  RAW variants, PCX/XPM/XBM) — those fall through to extension-based
 *  detection. */
function fromData(b: Uint8Array): ImageFormat | undefined {
  if (b.length < 4) return undefined
  for (const m of MAGIC) {
    if (matches(b, m.parts)) return m.format
  }
  // ISOBMFF container: bytes 4..7 == 'ftyp', major brand at 8..11.
  if (b.length >= 12 && matches(b, [{ b: "ftyp", o: 4 }])) {
    const brand = String.fromCharCode(b[8], b[9], b[10], b[11])
    if (brand === "avif" || brand === "avis") return "avif"
    if (HEIC_BRANDS.has(brand)) return "heic"
  }
  if (b[0] === 0x50 && NETPBM[b[1]]) return NETPBM[b[1]]
  // SVG: text starts with `<?xml` or `<svg` (allow leading whitespace).
  const head = Buffer.from(b.buffer, b.byteOffset, b.byteLength).toString("utf8").trimStart()
  if (head.startsWith("<?xml") || head.startsWith("<svg")) return "svg"
  return undefined
}
