import type { FileData } from "./data.ts"
import type { FileTypeDetect, MagicMatch } from "./file.ts"

export type ImageFormat = (typeof formats)[number]

// oxfmt-ignore
const formats = [
  "png", "jpeg", "gif", "webp", "avif", "heic", "svg", "bmp", "tiff", "ico", "jxl", "tga", "psd", "pbm", "pgm",
  "ppm", "pnm", "pam", "raw", "arw", "cr2", "cr3", "nef", "nrw", "orf", "raf", "rw2", "dng", "pcx", "xpm", "xbm",
  "jp2", "j2c", "icns", "dds", "ktx",
] as const

// ── Extension aliases ────────────────────────────────────────────────────

const ext: Partial<Record<string, ImageFormat>> = {
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
// Identity entries for the formats whose extension matches the format
// name itself — saves a per-format loop in the generic engine.
for (const f of formats) ext[f] ??= f

// ── Magic-byte signatures ────────────────────────────────────────────────

// oxfmt-ignore
// oxlint-disable-next-line sort-keys
const magic: Partial<Record<ImageFormat, readonly MagicMatch[]>> = {
  bmp:  [[{ b: "BM" }]],
  dds:  [[{ b: "DDS " }]],
  png:  [[{ b: [0x89, 0x50, 0x4e, 0x47] }]],
  gif:  [[{ b: "GIF8" }]],
  // TIFF: little-endian (`II*\0`) or big-endian (`MM\0*`). Many camera
  // RAW formats are TIFF-based and surface here as `tiff` — expected.
  tiff: [[{ b: "II*\0" }], [{ b: "MM\0*" }]],
  // ICO: 00 00 01 00. CUR uses 00 00 02 00 and is treated as the same family.
  ico:  [[{ b: [0x00, 0x00, 0x01, 0x00] }], [{ b: [0x00, 0x00, 0x02, 0x00] }]],
  psd:  [[{ b: "8BPS" }]],
  webp: [[{ b: "RIFF" }, { b: "WEBP", o: 8 }]],
  icns: [[{ b: "icns" }]],
  jpeg: [[{ b: [0xff, 0xd8, 0xff] }]],
  // JPEG 2000 — file (signature box) and bare codestream.
  jp2:  [[{ b: [0x00, 0x00, 0x00, 0x0c, 0x6a, 0x50, 0x20, 0x20, 0x0d, 0x0a, 0x87, 0x0a] }]],
  j2c:  [[{ b: [0xff, 0x4f, 0xff, 0x51] }]],
  // JPEG XL — codestream (FF 0A) and container (...JXL signature box).
  jxl:  [
    [{ b: [0xff, 0x0a] }],
    [{ b: [0x00, 0x00, 0x00, 0x0c] }, { b: "JXL ", o: 4 }],
  ],
  ktx:  [
    [{ b: [0xab, 0x4b, 0x54, 0x58, 0x20, 0x31, 0x31, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a] }],
    [{ b: [0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a] }],
  ],
}

// ── Custom byte-level dispatch ───────────────────────────────────────────

/** ISOBMFF major brands that identify a HEIC/HEIF file. Sequence
 *  (`-sequence`) and image-collection (`mif1` / `msf1`) variants are
 *  treated the same — they're all served by HEIC decoders. */
// oxfmt-ignore
const HEIC_BRANDS = new Set([
  "heic", "heix", "heim", "heis",
  "hevc", "hevx", "hevm", "hevs",
  "mif1", "msf1",
])

/** Netpbm subtype dispatch — byte 0 is `'P'`, byte 1 selects the variant.
 *  Pairs are ASCII / binary forms of the same format (P1/P4, P2/P5, P3/P6). */
// oxfmt-ignore
const NETPBM: Partial<Record<number, ImageFormat>> = {
  0x31: "pbm", 0x32: "pgm",
  0x33: "ppm", 0x34: "pbm",
  0x35: "pgm", 0x36: "ppm",
  0x37: "pam",
}

/** Byte-level fallback that handles formats without fixed magic
 *  signatures: ISOBMFF (AVIF/HEIC) brand parsing, Netpbm header
 *  variant dispatch, SVG text peek. */
function customImage(file: FileData): ImageFormat | undefined {
  const b = file.data
  // ISOBMFF: bytes 4..7 == 'ftyp', major brand at 8..11.
  if (b.length >= 12 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
    const brand = String.fromCharCode(b[8], b[9], b[10], b[11])
    if (brand === "avif" || brand === "avis") return "avif"
    if (HEIC_BRANDS.has(brand)) return "heic"
  }
  if (b.length >= 2 && b[0] === 0x50 && NETPBM[b[1]]) return NETPBM[b[1]]
  // SVG: text starts with `<?xml` or `<svg` (allow leading whitespace).
  const head = Buffer.from(b.subarray(0, 256)).toString("utf8").trimStart()
  if (head.startsWith("<?xml") || head.startsWith("<svg")) return "svg"
  return undefined
}

// ── Detector ─────────────────────────────────────────────────────────────

export const imageDetector: FileTypeDetect<"image", ImageFormat> = {
  custom: customImage,
  ext,
  formats,
  magic,
  mime: {
    avif: "avif",
    bmp: "bmp",
    gif: "gif",
    heic: "heic",
    heif: "heic",
    icon: "ico",
    "image/jp2": "jp2",
    "image/jpx": "jp2",
    "image/x-icon": "ico",
    "image/x-portable-bitmap": "pbm",
    "image/x-portable-graymap": "pgm",
    "image/x-portable-pixmap": "ppm",
    "image/x-targa": "tga",
    "image/x-tga": "tga",
    jp2: "jp2",
    jpeg: "jpeg",
    jpg: "jpeg",
    jxl: "jxl",
    png: "png",
    svg: "svg",
    tga: "tga",
    tiff: "tiff",
    webp: "webp",
  },
  type: "image",
}
