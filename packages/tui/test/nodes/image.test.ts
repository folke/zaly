import type { RenderCtx } from "../../src/core/ctx.ts"
import type { ImageState } from "../../src/widgets/image.ts"

import { fileDetect } from "@zaly/shared/detect"
import { imageInfo } from "@zaly/shared/image"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import sharp from "sharp"
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest"
import { createCtx } from "../../src/core/ctx.ts"
import { memo, provideContext } from "../../src/core/reactive.ts"
import { createRender, RenderContext } from "../../src/core/render.ts"
import { Kitty, resetKittyGraphics } from "../../src/image/kitty.ts"
import { TerminalQueries } from "../../src/input/queries.ts"
import { InputRouter } from "../../src/input/router.ts"
import { defaultTheme } from "../../src/themes/registry.ts"
import { image } from "../../src/widgets/image.ts"
import { mockMountCtx } from "../renderer/mock.ts"

let dir: string
let pngPath: string
let jpgPath: string

const ENV_KEYS = ["SSH_CLIENT", "SSH_CONNECTION", "SSH_TTY"] as const
const savedEnv: Record<string, string | undefined> = {}

beforeAll(async () => {
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k]
  dir = mkdtempSync(join(tmpdir(), "zaly-image-"))
  pngPath = join(dir, "tiny.png")
  jpgPath = join(dir, "tiny.jpg")
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

afterEach(() => {
  resetKittyGraphics()
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k]
    else process.env[k] = savedEnv[k]
  }
})

type RenderResult = { bytes: string; rows: string[]; writes: string[] }

function kgpQueries(opts: { inline?: boolean; supported?: boolean; terminal?: string } = {}): {
  queries: TerminalQueries
  writes: string[]
} {
  const router = new InputRouter()
  const writes: string[] = []
  const terminal = {
    write: (seq: string) => {
      writes.push(seq)
      if (seq.includes("[>q")) {
        router.dispatch({
          kind: "dcs",
          payload: `>|${opts.terminal ?? (opts.inline === false ? "WezTerm" : "Ghostty")} 1.0`,
          sequence: `\x1bP>|${opts.terminal ?? (opts.inline === false ? "WezTerm" : "Ghostty")} 1.0\x1b\\`,
          type: "term-response",
        })
      } else if (seq.includes("\x1b_G")) {
        if (opts.supported === false) return
        router.dispatch({
          kind: "apc",
          payload: "Gi=4294967290;EINVAL: expected",
          sequence: "\x1b_Gi=4294967290;EINVAL: expected\x1b\\",
          type: "term-response",
        })
      }
    },
  }
  return { queries: new TerminalQueries(router, terminal), writes }
}

async function renderImage(
  src: string,
  opts?: Omit<ImageState, "src">,
  ctxOpts: Partial<RenderCtx> = {},
  queryOpts: { inline?: boolean; supported?: boolean; terminal?: string } = {}
): Promise<RenderResult> {
  const { queries, writes } = kgpQueries(queryOpts)
  let bytes = ""
  const ctx = createCtx({ transmit: (seq) => (bytes += seq), width: 40, ...ctxOpts })
  const rows = await createRender(() => {
    provideContext(RenderContext, {
      images: memo(() => true),
      queries,
      style: memo(() => ctx.style),
      theme: memo(() => defaultTheme),
    })
    const node = image(src, opts)
    const mount = mockMountCtx()
    node.mount({ ...mount, input: { ...mount.input, queries } })
    return node
  }, ctx)
  return { bytes, rows, writes }
}

function extractId(esc: string, key: string): string | undefined {
  return esc.match(new RegExp(`${key}=(\\d+)`))?.[1]
}

describe("image() — fallback", () => {
  test("renders alt when images are disabled", async () => {
    const { queries } = kgpQueries()
    const ctx = createCtx({ width: 40 })
    const rows = await createRender(() => {
      provideContext(RenderContext, {
        images: memo(() => false),
        queries,
        style: memo(() => ctx.style),
        theme: memo(() => defaultTheme),
      })
      const node = image(pngPath, { alt: "Diagram" })
      const mount = mockMountCtx()
      node.mount({ ...mount, input: { ...mount.input, queries } })
      return node
    }, ctx)
    expect(rows).toEqual(["Diagram"])
  })

  test("falls back to alt text when KGP probing fails", async () => {
    const { rows } = await renderImage(
      pngPath,
      { alt: "Diagram" },
      {},
      { supported: false, terminal: "UnknownTerm" }
    )
    expect(rows).toEqual(["Diagram"])
  })

  test("falls back to [Image: src] when alt omitted", async () => {
    const { rows } = await renderImage(
      pngPath,
      undefined,
      {},
      { supported: false, terminal: "UnknownTerm" }
    )
    expect(rows).toEqual([`[Image: ${pngPath}]`])
  })
})

describe("image() — KGP rendering", () => {
  test("first inline render transmits setup out-of-band and returns placeholder rows", async () => {
    const { bytes, rows } = await renderImage(pngPath, { height: 2, width: 4 })
    expect(rows).toHaveLength(2)
    expect(rows[0]).not.toContain("\x1b_G")
    expect(rows[0]).toContain("\u{10eeee}")
    expect(bytes).toContain("\x1b_Ga=t,f=100,i=")
    expect(bytes).toContain("\x1b_GU=1,")
    expect(bytes).toContain("a=p")
  })

  test("transmit payload is base64 of the absolute PNG path", async () => {
    const { bytes } = await renderImage(pngPath, { height: 2, width: 4 })
    const start = bytes.indexOf(";", bytes.indexOf("\x1b_Ga=t,")) + 1
    const end = bytes.indexOf("\x1b\\")
    expect(Buffer.from(bytes.slice(start, end), "base64").toString()).toBe(pngPath)
  })

  test("JPEG src is converted once to a temp PNG and transmitted by path", async () => {
    const { bytes } = await renderImage(jpgPath, { height: 2, width: 4 })
    const start = bytes.indexOf(";", bytes.indexOf("\x1b_Ga=t,")) + 1
    const end = bytes.indexOf("\x1b\\")
    const path = Buffer.from(bytes.slice(start, end), "base64").toString()
    expect(path).toContain("zaly-image-")
    expect(path.endsWith(".png")).toBe(true)
  })

  test("second inline render omits transmit and placement setup", async () => {
    await renderImage(pngPath, { height: 2, width: 4 })
    const { bytes, rows } = await renderImage(pngPath, { height: 2, width: 4 })
    expect(bytes).toBe("")
    expect(rows[0]).not.toContain("\x1b_G")
    expect(rows[0]).toContain("\u{10eeee}")
  })

  test("direct placement mode exposes placement ids for cleanup", async () => {
    resetKittyGraphics()
    const { rows } = await renderImage(pngPath, { height: 2, width: 4 }, {}, { inline: false })
    expect(rows[0]).toContain("a=p")
    expect(extractId(rows[0], "p")).toBeDefined()
  })

  test("remote Kitty transmits bytes in-band (t=d), no t=f path", async () => {
    resetKittyGraphics()
    const detected = await fileDetect(pngPath)
    if (detected?.type !== "image") throw new Error("Expected image detection")
    const info = await imageInfo(detected)
    const kitty = new Kitty({ ok: true, remote: true, terminal: { name: "kitty" } })
    const t = await kitty.transmitOnce(info)
    expect(t?.transmit).toContain("\x1b_Ga=t,f=100,i=")
    expect(t?.transmit).toContain(",t=d")
    expect(t?.transmit).not.toContain(",t=f,")
  })

  test("no dims: cols default to ctx.width, rows from source aspect", async () => {
    const { rows } = await renderImage(pngPath, undefined, { width: 16 })
    expect(rows).toHaveLength(4)
  })

  test("width only: height computed from source aspect ratio", async () => {
    const { rows } = await renderImage(pngPath, { cellAspect: 2, width: 8 })
    expect(rows).toHaveLength(2)
  })
})
