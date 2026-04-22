import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import sharp from "sharp"
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest"
import { createCtx } from "../../src/core/ctx.ts"
import { resetCapabilitiesCache } from "../../src/image/capabilities.ts"
import { resetImageCache } from "../../src/image/source.ts"
import { image, resetImageTransmitCache } from "../../src/widgets/image.ts"

// Fixture dir + a tiny PNG generated via sharp at setup. Keeping this in a
// temp dir avoids committing a binary to the repo.
let dir: string
let pngPath: string
let jpgPath: string

// Env keys our capability detection reads — snapshot at setup so we can
// restore exactly after tests mutate them.
const ENV_KEYS = [
  "GHOSTTY_RESOURCES_DIR",
  "ITERM_SESSION_ID",
  "KITTY_WINDOW_ID",
  "SSH_CLIENT",
  "SSH_CONNECTION",
  "SSH_TTY",
  "TERM",
  "TERM_PROGRAM",
  "TMUX",
  "WEZTERM_PANE",
] as const
const savedEnv: Record<string, string | undefined> = {}

beforeAll(async () => {
  // Vitest stdout isn't a TTY, so without this stub the detection in
  // `imageCapabilities()` would skip every code path we care about here.
  Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: true })
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k]
  dir = mkdtempSync(join(tmpdir(), "zaly-image-"))
  pngPath = join(dir, "tiny.png")
  jpgPath = join(dir, "tiny.jpg")
  // 4×2 solid red — sharp from raw RGB bytes.
  const raw = Buffer.alloc(4 * 2 * 3)
  for (let i = 0; i < raw.length; i += 3) {
    raw[i] = 0xff
    raw[i + 1] = 0
    raw[i + 2] = 0
  }
  await sharp(raw, { raw: { channels: 3, height: 2, width: 4 } })
    .png()
    .toFile(pngPath)
  await sharp(raw, { raw: { channels: 3, height: 2, width: 4 } })
    .jpeg()
    .toFile(jpgPath)
})

afterAll(() => {
  rmSync(dir, { force: true, recursive: true })
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k]
    else process.env[k] = savedEnv[k]
  }
})

function extractId(esc: string, key: string): string | undefined {
  return esc.match(new RegExp(`${key}=(\\d+)`))?.[1]
}

afterEach(() => {
  resetImageTransmitCache()
  resetImageCache()
  resetCapabilitiesCache()
})

function forceCaps(protocol: "kitty" | "iterm2" | undefined) {
  // Clear all detection-relevant env so previous tests don't leak in.
  for (const k of ENV_KEYS) delete process.env[k]
  resetCapabilitiesCache()
  if (protocol === "kitty") process.env.KITTY_WINDOW_ID = "1"
  else if (protocol === "iterm2") process.env.ITERM_SESSION_ID = "w0t0p0:1"
  else process.env.TERM = "xterm-256color"
}

describe("image() — fallback when placeholders unsupported", () => {
  test("renders [alt] when alt is set", async () => {
    forceCaps(undefined)
    const node = image(pngPath, { alt: "Diagram" })
    const rows = await node.render(createCtx({ width: 40 }))
    expect(rows).toEqual(["Diagram"])
  })

  test("falls back to [Image: src] when alt omitted", async () => {
    forceCaps(undefined)
    const node = image(pngPath)
    const rows = await node.render(createCtx({ width: 40 }))
    expect(rows).toEqual([`[Image: ${pngPath}]`])
  })
})

describe("image() — KGP rendering", () => {
  test("first render: row[0] carries both transmit (a=t,t=f) and placement (a=p)", async () => {
    forceCaps("kitty")
    const rows = await image(pngPath, { height: 2, width: 4 }).render(createCtx({ width: 40 }))
    expect(rows).toHaveLength(2)
    // Prepended transmit + placement in row[0], trailing `cols` spaces.
    expect(rows[0]).toContain("\x1b_Ga=t,f=100,t=f,")
    expect(rows[0]).toContain("\x1b_Ga=p,")
    expect(rows[0].endsWith("    ")).toBe(true)
    expect(rows[1]).toBe("    ")
  })

  test("transmit payload is base64 of the absolute PNG path", async () => {
    forceCaps("kitty")
    const [row] = await image(pngPath, { height: 2, width: 4 }).render(createCtx({ width: 40 }))
    const start = row.indexOf(";", row.indexOf("\x1b_Ga=t,")) + 1
    const end = row.indexOf("\x1b\\")
    expect(Buffer.from(row.slice(start, end), "base64").toString()).toBe(pngPath)
  })

  test("JPEG src is converted once to a temp PNG and transmitted by path", async () => {
    forceCaps("kitty")
    const [row] = await image(jpgPath, { height: 2, width: 4 }).render(createCtx({ width: 40 }))
    const start = row.indexOf(";", row.indexOf("\x1b_Ga=t,")) + 1
    const end = row.indexOf("\x1b\\")
    const path = Buffer.from(row.slice(start, end), "base64").toString()
    expect(path).toContain("zaly-tty-graphics-protocol-")
    expect(path.endsWith(".png")).toBe(true)
  })

  test("second render for same src omits the transmit — only the placement is emitted", async () => {
    forceCaps("kitty")
    await image(pngPath, { height: 2, width: 4 }).render(createCtx({ width: 40 }))
    const [row] = await image(pngPath, { height: 2, width: 4 }).render(createCtx({ width: 40 }))
    expect(row).not.toContain("\x1b_Ga=t,")
    expect(row).toContain("\x1b_Ga=p,")
  })

  test("re-rendering the same node re-uses (image id, placement id) — a move, not a create", async () => {
    // Spec: two placements with the same (i, p) — the second replaces
    // the first, flicker-free. That's our re-render story.
    forceCaps("kitty")
    const node = image(pngPath, { height: 2, width: 4 })
    const r1 = await node.render(createCtx({ width: 40 }))
    const r2 = await node.render(createCtx({ width: 40 }))
    expect(extractId(r1[0], "i")).toBe(extractId(r2[0], "i"))
    expect(extractId(r1[0], "p")).toBe(extractId(r2[0], "p"))
  })

  test("SSH session: transmit falls back to bytes-in-band (t=d), no t=f path", async () => {
    // Under SSH the terminal can't read the client's filesystem, so we
    // have to chunk the PNG payload inline instead of passing a path.
    forceCaps("kitty")
    process.env.SSH_CONNECTION = "192.168.0.1 54321 192.168.0.2 22"
    const [row] = await image(pngPath, { height: 2, width: 4 }).render(createCtx({ width: 40 }))
    // Header is `a=t,f=100,i=<id>,q=2` (no `t=f`). The PNG header bytes
    // (0x89 0x50 0x4E 0x47) survive the base64 round-trip.
    expect(row).toContain("\x1b_Ga=t,f=100,i=")
    expect(row).not.toContain(",t=f,")
    const start = row.indexOf(";", row.indexOf("\x1b_Ga=t,")) + 1
    const end = row.indexOf("\x1b\\")
    const bytes = Buffer.from(row.slice(start, end), "base64")
    expect(bytes[0]).toBe(0x89)
    expect(bytes[1]).toBe(0x50)
  })

  test("iTerm2 path: single OSC 1337 escape inline, raw source bytes in base64", async () => {
    forceCaps("iterm2")
    const rows = await image(jpgPath, { height: 2, width: 4 }).render(createCtx({ width: 40 }))
    expect(rows).toHaveLength(2)
    expect(rows[0].startsWith("\x1b]1337;File=")).toBe(true)
    // JPEG header (0xFF 0xD8) must survive the base64 round-trip — proves
    // we're shipping raw source bytes, no sharp conversion.
    const colon = rows[0].indexOf(":")
    const bel = rows[0].indexOf("\x07")
    const bytes = Buffer.from(rows[0].slice(colon + 1, bel), "base64")
    expect(bytes[0]).toBe(0xff)
    expect(bytes[1]).toBe(0xd8)
  })

  test("no dims: cols default to ctx.width, rows from source aspect", async () => {
    forceCaps("kitty")
    // tiny.png is 4×2 → aspect 0.5. With cellAspect=2, a 16-wide ctx gives
    // rows = round(16 * 0.5 / 2) = 4.
    const rows = await image(pngPath).render(createCtx({ width: 16 }))
    expect(rows).toHaveLength(4)
  })

  test("width only: height computed from source aspect ratio", async () => {
    forceCaps("kitty")
    const rows = await image(pngPath, { cellAspect: 2, width: 8 }).render(createCtx({ width: 40 }))
    expect(rows).toHaveLength(2) // round(8 * 0.5 / 2) = 2
  })
})
