import type { TerminalResponseEvent } from "../../src/input/decoder.ts"

import { afterEach, describe, expect, test } from "vitest"
import { InputRouter } from "../../src/input/router.ts"
import { TerminalQueries } from "../../src/input/queries.ts"
import { loadKittyGraphics, resetKittyGraphics } from "../../src/image/kitty.ts"

function apc(sequence: string): TerminalResponseEvent {
  return { kind: "apc", payload: sequence.slice(2, -2), sequence, type: "term-response" }
}

function queries(opts: { kgp?: boolean; terminal?: string } = {}): { queries: TerminalQueries; writes: string[] } {
  const router = new InputRouter()
  const writes: string[] = []
  const terminal = opts.terminal ?? "Ghostty 1.0"
  return {
    queries: new TerminalQueries(router, {
      write: (seq) => {
        writes.push(seq)
        if (seq.includes("[>q")) {
          router.dispatch({
            kind: "dcs",
            payload: `>|${terminal}`,
            sequence: `\x1bP>|${terminal}\x1b\\`,
            type: "term-response",
          })
        } else if (seq.includes("\x1b_G") && opts.kgp !== false) {
          router.dispatch(apc("\x1b_Gi=4294967290;EINVAL: expected\x1b\\"))
        }
      },
    }),
    writes,
  }
}

afterEach(() => resetKittyGraphics())

describe("loadKittyGraphics", () => {
  test("detects KGP support from terminal responses", async () => {
    const { queries: tq } = queries()
    const kitty = await loadKittyGraphics(tq)
    expect(kitty.supported).toBe(true)
    expect(kitty.inline).toBe(true)
  })

  test("marks support false when KGP probe gets no response", async () => {
    const { queries: tq } = queries({ kgp: false, terminal: "UnknownTerm 1.0" })
    const kitty = await loadKittyGraphics(tq)
    expect(kitty.supported).toBe(false)
  })

  test("does not enable inline placeholders for terminals outside the allow-list", async () => {
    const { queries: tq } = queries({ terminal: "WezTerm 20240203" })
    const kitty = await loadKittyGraphics(tq)
    expect(kitty.supported).toBe(true)
    expect(kitty.inline).toBe(false)
  })
})
