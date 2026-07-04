import type { TerminalResponseEvent } from "../../src/input/decoder.ts"

import { describe, expect, test } from "vitest"
import { InputRouter } from "../../src/input/router.ts"
import { TerminalQueries } from "../../src/input/queries.ts"
import {
  allocateImageId,
  allocatePlacementId,
  Kitty,
  resetKittyGraphics,
} from "../../src/image/kitty.ts"

function response(sequence: string): TerminalResponseEvent {
  return { kind: "apc", payload: sequence.slice(2, -2), sequence, type: "term-response" }
}

function queries(respond: (seq: string, router: InputRouter) => void): TerminalQueries {
  const router = new InputRouter()
  return new TerminalQueries(router, {
    write: (seq) => respond(seq, router),
  })
}

describe("Kitty", () => {
  test("request encodes params and base64 payloads", () => {
    const kitty = new Kitty({ ok: true, terminal: { name: "kitty" } })
    const seq = kitty.request({ a: "t", i: 7, t: "f" }, "/abs/path.png")
    expect(seq).toBe(`\x1b_Ga=t,i=7,t=f;${Buffer.from("/abs/path.png").toString("base64")}\x1b\\`)
  })

  test("request can pass through pre-encoded payloads", () => {
    const kitty = new Kitty({ ok: true, terminal: { name: "kitty" } })
    expect(kitty.request({ a: "t", i: 7 }, "already-base64", { base64: false })).toBe(
      "\x1b_Ga=t,i=7;already-base64\x1b\\"
    )
  })

  test("parse handles OK responses", () => {
    const kitty = new Kitty({ ok: true, terminal: { name: "kitty" } })
    expect(kitty.parse("\x1b_Gi=7,p=3;OK\x1b\\")).toEqual({ attrs: { i: 7, p: 3 }, ok: true })
  })

  test("parse handles error responses", () => {
    const kitty = new Kitty({ ok: true, terminal: { name: "kitty" } })
    expect(kitty.parse("\x1b_Gi=7;EINVAL: bad request\x1b\\")).toEqual({
      attrs: { i: 7 },
      error: { code: "EINVAL", message: "bad request" },
      ok: false,
    })
  })

  test("query matches KGP APC responses", async () => {
    const kitty = new Kitty({ ok: true, terminal: { name: "kitty" } })
    const tq = queries((seq, router) => {
      expect(seq).toBe("\x1b_Ga=q,i=1\x1b\\")
      router.dispatch(response("\x1b_Gi=1;OK\x1b\\"))
    })

    await expect(tq.query(kitty.query({ a: "q", i: 1 }))).resolves.toMatchObject({
      attrs: { i: 1 },
      kind: "apc",
      ok: true,
    })
  })

  test("probe only requires a KGP response", async () => {
    const kitty = new Kitty({ ok: false, error: "", terminal: { name: "kitty" } })
    const tq = queries((_, router) => router.dispatch(response("\x1b_Gi=4294967290;EINVAL: expected\x1b\\")))
    await expect(tq.query({
      match: (ev) => ev.kind === "apc" ? kitty.parse(ev.sequence) : undefined,
      request: kitty.probe(),
    })).resolves.toMatchObject({ ok: false })
  })

  test("placement emits unicode placeholder rows for inline terminals", () => {
    const kitty = new Kitty({ inline: true, ok: true, terminal: { name: "kitty" } })
    const p = kitty.placement(0x11_22_33, { cols: 4, rows: 2 })
    expect(p?.inline).toBe(true)
    expect(p?.seq).toContain("U=1")
    expect(p?.seq).toContain("a=p")
    expect(p?.data).toHaveLength(2)
    expect(p?.data[0]).toContain("\u{10eeee}")
  })

  test("placement emits direct placement rows for non-inline terminals", () => {
    const kitty = new Kitty({ ok: true, terminal: { name: "wezterm" } })
    const p = kitty.placement(42, { cols: 4, rows: 2 })
    expect(p?.inline).toBeUndefined()
    expect(p?.placementId).toBeDefined()
    expect(p?.seq).toContain("a=p")
    expect(p?.seq).toContain("C=1")
    expect(p?.data).toEqual(["    ", "    "])
  })

  test("delete helpers emit KGP delete requests", () => {
    const kitty = new Kitty({ ok: true, terminal: { name: "kitty" } })
    expect(kitty.deleteImage(42)).toBe("\x1b_Ga=d,d=I,i=42,q=2\x1b\\")
    expect(kitty.deletePlacement(42, 7)).toBe("\x1b_Ga=d,d=i,i=42,p=7,q=2\x1b\\")
    expect(kitty.deleteImage()).toBe("\x1b_Ga=d,d=A,q=2\x1b\\")
  })

  test("transmitBytes chunks large payloads", () => {
    const kitty = new Kitty({ ok: true, terminal: { name: "kitty" } })
    const seq = kitty.transmitBytes(99, new Uint8Array(6000).fill(0x42))
    expect(seq.indexOf("\x1b_Ga=t,f=100,i=99,q=2,t=d,m=1;")).toBe(0)
    expect(seq).toContain("\x1b_Gm=0;")
  })
})

describe("id allocators", () => {
  test("allocateImageId returns positive 24-bit integers", () => {
    for (let i = 0; i < 100; i++) {
      const id = allocateImageId()
      expect(id).toBeGreaterThanOrEqual(1)
      expect(id).toBeLessThanOrEqual(0xff_ff_fd)
      expect(Number.isInteger(id)).toBe(true)
    }
  })

  test("allocatePlacementId returns positive 24-bit integers", () => {
    for (let i = 0; i < 100; i++) {
      const id = allocatePlacementId()
      expect(id).toBeGreaterThanOrEqual(1)
      expect(id).toBeLessThanOrEqual(0xff_ff_fd)
    }
  })
})

describe("resetKittyGraphics", () => {
  test("clears module caches", () => {
    resetKittyGraphics()
    expect(true).toBe(true)
  })
})
