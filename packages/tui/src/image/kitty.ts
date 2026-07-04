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
 * Reference: https://sw.kovidgoyal.net/kitty/graphics-protocol/
 */

import type { MaybePromise } from "@zaly/shared"
import type { ImageInfo } from "@zaly/shared/image"
import type { TerminalQueries, TerminalQuery } from "../input/queries.ts"

import { isSSH } from "@zaly/shared/env"

export type KittyPlacement = {
  imageId: number
  /** Placement ID. Omitted when this is an inline placement (U=1) */
  placementId?: number
  /** inline: placement using unicode placeholder (U=1) */
  inline?: boolean
  /** The KGP escape sequence to place the image */
  seq: string
  /** Rows to render (excluding the placement escape sequence) */
  data: string[]
}

export type ImageSupport = {
  terminal?: { name: string; version?: string }
  remote?: boolean
  wrap?: (seq: string) => string
  tmux?: boolean
} & (
  | {
      ok: false
      error: string
      terminal?: { name: string; version?: string }
    }
  | {
      ok: true
      error?: never
      terminal: { name: string; version?: string }
      inline?: boolean
    }
)

export type KittyResponse =
  | {
      attrs: Record<string, string | number>
      ok: true
    }
  | {
      attrs: Record<string, string | number>
      ok: false
      error: { code: string; message: string }
    }

export type PlacementDims = {
  /** Display width in terminal cells. */
  cols: number
  /** Display height in terminal cells. */
  rows: number
}

// Per-src transmit cache. The first caller gets the full transmit sequence;
// subsequent callers get undefined since the terminal already has the bytes.
type CacheEntry = {
  imageId: number
  seq: string
  sent: boolean
}

// oxfmt-ignore
// oxlint-disable-next-line unicorn/numeric-separators-style
export const DIACRITICS = [ 0x0305, 0x030d, 0x030e, 0x0310, 0x0312, 0x033d, 0x033e, 0x033f, 0x0346, 0x034a, 0x034b, 0x034c, 0x0350, 0x0351, 0x0352, 0x0357, 0x035b, 0x0363, 0x0364, 0x0365, 0x0366, 0x0367, 0x0368, 0x0369, 0x036a, 0x036b, 0x036c, 0x036d, 0x036e, 0x036f, 0x0483, 0x0484, 0x0485, 0x0486, 0x0487, 0x0592, 0x0593, 0x0594, 0x0595, 0x0597, 0x0598, 0x0599, 0x059c, 0x059d, 0x059e, 0x059f, 0x05a0, 0x05a1, 0x05a8, 0x05a9, 0x05ab, 0x05ac, 0x05af, 0x05c4, 0x0610, 0x0611, 0x0612, 0x0613, 0x0614, 0x0615, 0x0616, 0x0617, 0x0657, 0x0658, 0x0659, 0x065a, 0x065b, 0x065d, 0x065e, 0x06d6, 0x06d7, 0x06d8, 0x06d9, 0x06da, 0x06db, 0x06dc, 0x06df, 0x06e0, 0x06e1, 0x06e2, 0x06e4, 0x06e7, 0x06e8, 0x06eb, 0x06ec, 0x0730, 0x0732, 0x0733, 0x0735, 0x0736, 0x073a, 0x073d, 0x073f, 0x0740, 0x0741, 0x0743, 0x0745, 0x0747, 0x0749, 0x074a, 0x07eb, 0x07ec, 0x07ed, 0x07ee, 0x07ef, 0x07f0, 0x07f1, 0x07f3, 0x0816, 0x0817, 0x0818, 0x0819, 0x081b, 0x081c, 0x081d, 0x081e, 0x081f, 0x0820, 0x0821, 0x0822, 0x0823, 0x0825, 0x0826, 0x0827, 0x0829, 0x082a, 0x082b, 0x082c, 0x082d, 0x0951, 0x0953, 0x0954, 0x0f82, 0x0f83, 0x0f86, 0x0f87, 0x135d, 0x135e, 0x135f, 0x17dd, 0x193a, 0x1a17, 0x1a75, 0x1a76, 0x1a77, 0x1a78, 0x1a79, 0x1a7a, 0x1a7b, 0x1a7c, 0x1b6b, 0x1b6d, 0x1b6e, 0x1b6f, 0x1b70, 0x1b71, 0x1b72, 0x1b73, 0x1cd0, 0x1cd1, 0x1cd2, 0x1cda, 0x1cdb, 0x1ce0, 0x1dc0, 0x1dc1, 0x1dc3, 0x1dc4, 0x1dc5, 0x1dc6, 0x1dc7, 0x1dc8, 0x1dc9, 0x1dcb, 0x1dcc, 0x1dd1, 0x1dd2, 0x1dd3, 0x1dd4, 0x1dd5, 0x1dd6, 0x1dd7, 0x1dd8, 0x1dd9, 0x1dda, 0x1ddb, 0x1ddc, 0x1ddd, 0x1dde, 0x1ddf, 0x1de0, 0x1de1, 0x1de2, 0x1de3, 0x1de4, 0x1de5, 0x1de6, 0x1dfe, 0x20d0, 0x20d1, 0x20d4, 0x20d5, 0x20d6, 0x20d7, 0x20db, 0x20dc, 0x20e1, 0x20e7, 0x20e9, 0x20f0, 0x2cef, 0x2cf0, 0x2cf1, 0x2de0, 0x2de1, 0x2de2, 0x2de3, 0x2de4, 0x2de5, 0x2de6, 0x2de7, 0x2de8, 0x2de9, 0x2dea, 0x2deb, 0x2dec, 0x2ded, 0x2dee, 0x2def, 0x2df0, 0x2df1, 0x2df2, 0x2df3, 0x2df4, 0x2df5, 0x2df6, 0x2df7, 0x2df8, 0x2df9, 0x2dfa, 0x2dfb, 0x2dfc, 0x2dfd, 0x2dfe, 0x2dff, 0xa66f, 0xa67c, 0xa67d, 0xa6f0, 0xa6f1, 0xa8e0, 0xa8e1, 0xa8e2, 0xa8e3, 0xa8e4, 0xa8e5, 0xa8e6, 0xa8e7, 0xa8e8, 0xa8e9, 0xa8ea, 0xa8eb, 0xa8ec, 0xa8ed, 0xa8ee, 0xa8ef, 0xa8f0, 0xa8f1, 0xaab0, 0xaab2, 0xaab3, 0xaab7, 0xaab8, 0xaabe, 0xaabf, 0xaac1, 0xfe20, 0xfe21, 0xfe22, 0xfe23, 0xfe24, 0xfe25, 0xfe26, 0x10a0f, 0x10a38, 0x1d185, 0x1d186, 0x1d187, 0x1d188, 0x1d189, 0x1d1aa, 0x1d1ab, 0x1d1ac, 0x1d1ad, 0x1d242, 0x1d243, 0x1d244 ].map((c) => String.fromCodePoint(c))
export const PLACEHOLDER = String.fromCodePoint(0x10_ee_ee)
const CHUNK_SIZE = 4096
const transmitCache = new Map<string, CacheEntry>()

const known: Record<string, { inline?: boolean } | false | undefined> = {
  ghostty: { inline: true },
  kitty: { inline: true },
  rio: { inline: false },
  wezterm: { inline: false },
}

let prom: Promise<Kitty> | undefined = undefined
let kitty: Kitty | undefined = undefined
const wrapTmux = (seq: string): string => `\x1bPtmux;${seq.replaceAll("\x1b", "\x1b\x1b")}\x1b\\`

/** Allocate a fresh 24-bit image id (1..0xFFFFFFFE). */
export function allocateImageId(): number {
  return Math.floor(Math.random() * 0xff_ff_fd) + 1
}

/** Allocate a fresh 24-bit placement id. */
export function allocatePlacementId(): number {
  return Math.floor(Math.random() * 0xff_ff_fd) + 1
}

export class Kitty {
  #support: ImageSupport
  #wrap: (seq: string) => string = (s) => s

  constructor(support: ImageSupport) {
    this.#support = support
    this.#wrap = support.wrap ?? ((s) => s)
  }

  get supported(): boolean {
    return this.#support.ok
  }

  get inline(): boolean {
    return this.#support.ok && this.#support.inline === true
  }

  /** Create a KGP request escape sequence */
  request(
    attrs: Record<string, string | number>,
    data?: string | Uint8Array,
    opts: { base64?: boolean } = {}
  ): string {
    const params = Object.entries(attrs)
      .map(([k, v]) => `${k}=${v}`)
      .join(",")
    let encoded: string | undefined
    if (opts.base64 === false && typeof data === "string") encoded = data
    else if (data)
      encoded = toBase64(typeof data === "string" ? new TextEncoder().encode(data) : data)
    const payload = encoded ? `;${encoded}` : ""
    return this.#wrap(`\x1b_G${params}${payload}\x1b\\`)
  }

  /** Create a TerminalQuery that requests a KGP operation and parses the response. */
  query(
    attrs: Record<string, string | number>,
    data?: string | Uint8Array,
    opts: { base64?: boolean } = {}
  ): TerminalQuery {
    return {
      match: (ev) => {
        if (ev.kind !== "apc") return
        const kr = this.parse(ev.sequence)
        if (!kr) return
        return { ...ev, ...kr }
      },
      request: this.request(attrs, data, opts),
    }
  }

  /** Probe the terminal for KGP support. Should return an error response. */
  probe(): string {
    return this.request({ i: 4_294_967_290, s: 10, t: "s", v: 2 }, "<error>")
  }

  /** Parse a KGP response escape sequence into a structured object. */
  parse(res: string): KittyResponse | undefined {
    if (!res.startsWith("\x1b_G") || !res.endsWith("\x1b\\")) return undefined
    const body = res.slice(3, -2)
    const m = body.match(/^([^;]+);(.*)?$/)
    if (!m) return undefined
    const [_, params, data] = m as [string, string, string | undefined]
    const attrs: Record<string, string | number> = {}
    for (const pair of params.split(",")) {
      const [k, v] = pair.split("=", 2)
      if (k && v) attrs[k] = /^\d+$/.test(v) ? parseInt(v, 10) : v
    }
    if (data === "OK") return { attrs, ok: true }
    const error = data?.match(/^([A-Z]+):\s*(.*)$/)
    return {
      attrs,
      error: error
        ? { code: error[1], message: error[2] }
        : { code: "UNKNOWN", message: data ?? "" },
      ok: false,
    }
  }

  placement(imageId: number, dims: PlacementDims): KittyPlacement | undefined {
    if (!this.#support.ok) return
    if (this.#support.inline)
      return {
        data: unicodePlaceholder(imageId, dims),
        imageId,
        inline: true,
        seq: this.request({ U: 1, a: "p", c: dims.cols, i: imageId, q: 2, r: dims.rows }),
      }
    const blank = " ".repeat(dims.cols)
    const placementId = allocatePlacementId()
    // NOTE: never sort this, since we need a deterministic order for bumping placements
    // oxlint-disable-next-line sort-keys
    const seq = this.request({
      a: "p",
      i: imageId,
      p: placementId,
      C: 1,
      c: dims.cols,
      q: 2,
      r: dims.rows,
    })
    return {
      data: Array.from<string>({ length: dims.rows }).fill(blank),
      imageId,
      placementId,
      seq,
    }
  }

  /** Delete an image and all its placements, or ALL images if `imageId` is omitted. */
  deleteImage(imageId?: number): string {
    return imageId === undefined
      ? this.request({ a: "d", d: "A", q: 2 })
      : this.request({ a: "d", d: "I", i: imageId, q: 2 })
  }

  /** Delete a placement (keeps image data so it can be re-placed cheaply). */
  deletePlacement(imageId: number, placementId: number): string {
    return this.request({ a: "d", d: "i", i: imageId, p: placementId, q: 2 })
  }

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
  async transmitOnce(info: ImageInfo): Promise<{ imageId: number; transmit?: string } | undefined> {
    if (!this.#support.ok) return undefined
    const { fileHash } = await import("@zaly/shared/detect")
    const key = fileHash(info)
    let entry = transmitCache.get(key)
    if (entry === undefined) {
      const { imageConvert } = await import("@zaly/shared/image")
      const png = await imageConvert(info, "png")
      if (!png) return undefined
      const id = allocateImageId()
      // Under SSH the terminal can't read files on the local side, so
      // fall back to bytes-in-band (`t=d`). Locally we pass a path and
      // the transmit payload stays under 1KB.
      entry = {
        imageId: id,
        sent: false,
        seq:
          this.#support.remote || !png.path
            ? this.transmitBytes(id, png.data)
            : this.transmitFile(id, png.path),
      }
      transmitCache.set(key, entry)
    }
    if (entry.sent) {
      entry.seq = "" // Clear the transmit memory
      return { imageId: entry.imageId }
    }
    entry.sent = true
    return { imageId: entry.imageId, transmit: entry.seq }
  }

  /**
   * Transmit an image to the terminal by file path (`t=f`). Near-zero cost
   * on the wire — the terminal opens and reads the file itself. `path`
   * must be absolute and must point to a regular file; symlinks are
   * followed by the terminal.
   */
  transmitFile(id: number, path: string): string {
    return this.request({ a: "t", f: 100, i: id, q: 2, t: "f" }, path)
  }

  /**
   * Remote/bytes transmission fallback (`t=d`) for when the terminal can't
   * read local files — typical of SSH sessions. Base64-encodes and chunks
   * the PNG payload at 4KB boundaries per the protocol.
   */
  transmitBytes(id: number, png: Uint8Array): string {
    const base64 = toBase64(png)
    const params = { a: "t", f: 100, i: id, q: 2, t: "d" }
    if (base64.length <= CHUNK_SIZE) return this.request(params, base64, { base64: false })

    const out: string[] = []
    let offset = 0
    let first = true
    while (offset < base64.length) {
      const chunk = base64.slice(offset, offset + CHUNK_SIZE)
      offset += CHUNK_SIZE
      const more = offset < base64.length ? 1 : 0
      out.push(this.request(first ? { ...params, m: more } : { m: more }, chunk, { base64: false }))
      first = false
    }
    return out.join("")
  }
}

/** Drop the per-src transmit cache. Mostly for tests. */
export function resetTransmitCache(): void {
  transmitCache.clear()
}

export function resetKittyGraphics(): void {
  resetTransmitCache()
  prom = undefined
  kitty = undefined
}

function intToRgb(color24bit: number): { r: number; g: number; b: number } {
  const r = (color24bit >> 16) & 0xff
  const g = (color24bit >> 8) & 0xff
  const b = color24bit & 0xff
  return { b, g, r }
}

function unicodePlaceholder(id: number, dims: PlacementDims): string[] {
  const rgb = intToRgb(id)
  const rows = Math.min(DIACRITICS.length, dims.rows)
  const cols = Math.min(DIACRITICS.length, dims.cols)
  const fg = `\x1b[38;2;${rgb.r};${rgb.g};${rgb.b}m`
  const img: string[] = []
  for (let r = 0; r < rows; r++) {
    const line: string[] = []
    for (let c = 0; c < cols; c++) {
      line.push(fg)
      line.push(PLACEHOLDER)
      line.push(DIACRITICS[r])
      line.push(DIACRITICS[c])
    }
    line.push("\x1b[39m")
    img.push(line.join(""))
  }
  return img
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
  // We only need to bump placements when:
  // - kitty graphics are loaded (when not loaded, there can't be any placements yet)
  // - we're not using inline placements (when using inline, the placement is part of the row and doesn't need to be bumped)
  if (!kitty || kitty.inline) return

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
  const k = kitty
  return {
    delete: () => placements.map((p) => k.deletePlacement(p.i, p.p)).join(""),
    rows: ret,
  }
}

async function detect(tq: TerminalQueries): Promise<ImageSupport> {
  const support: Omit<ImageSupport, "ok" | "error"> = {
    remote: isSSH,
    tmux: !!process.env.TMUX,
    // Escape sequences must be wrapped in a special way for tmux to pass them
    // through to the underlying terminal.
    wrap: process.env.TMUX ? wrapTmux : undefined,
  }
  if (support.tmux) {
    try {
      const { spawnCmd } = await import("@zaly/shared/process")
      // TMUX needs to have allow-passthrough set to all images to work properly
      await spawnCmd("tmux", "set", "-p", "allow-passthrough", "on")
      support.wrap = wrapTmux
    } catch (error) {
      return {
        ...support,
        error: `Failed to set allow-passthrough in tmux: ${error instanceof Error ? error.message : String(error)}`,
        ok: false,
      }
    }
  }

  const v = await tq.xtVersion({ wrap: support.wrap })
  if (!v) return { error: "Failed to query terminal name & version", ok: false, ...support }

  support.terminal = { name: v.name, version: v.version }

  const kgp = known[v.name.toLowerCase()]
  if (kgp === false)
    return { error: `Terminal ${v.name} does not support KGP`, ok: false, ...support }

  if (kgp === undefined) {
    // Probe KGP support
    // Create a tmp Kitty instance to probe the terminal for KGP support.
    const k = new Kitty({ ...support, error: "", ok: false })
    const res = await tq.query({
      match: (ev) => {
        if (ev.kind === "apc" && ev.payload.startsWith("G")) return { kgp: true, ...ev }
        if (ev.kind === "csi" && ev.final === "c" && ev.params.startsWith("?"))
          return { kgp: false, ...ev }
        return
      },
      request: `${k.probe()}\x1b[c`,
      timeout: 200,
    })
    if (res?.kgp !== true)
      return { error: "Failed to query kitty graphics protocol", ok: false, ...support }
  }

  return {
    ...support,
    inline: kgp?.inline,
    ok: true,
    terminal: { name: v.name, version: v.version },
  }
}

export function loadKittyGraphics(tq: TerminalQueries): MaybePromise<Kitty> {
  if (kitty) return kitty
  prom ??= (async () => (kitty = new Kitty(await detect(tq))))()
  return prom
}
