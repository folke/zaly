import { describe, expect, test } from "vitest"
import { InputRouter } from "../../src/input/router.ts"
import { TerminalQueries } from "../../src/input/queries.ts"

type Write = { writes: string[]; write: (seq: string) => void }

function writer(): Write {
  const writes: string[] = []
  return {
    write: (seq) => {
      writes.push(seq)
    },
    writes,
  }
}

describe("TerminalQueries", () => {
  test("registers the waiter before writing the request", async () => {
    const router = new InputRouter()
    const terminal = writer()
    terminal.write = (seq) => {
      terminal.writes.push(seq)
      router.dispatch({
        final: "c",
        kind: "csi",
        params: "?1;2",
        sequence: "\x1b[?1;2c",
        type: "term-response",
      })
    }
    const queries = new TerminalQueries(router, terminal)

    const response = await queries.primaryDeviceAttributes()

    expect(terminal.writes).toEqual(["\x1b[c"])
    expect(response?.sequence).toBe("\x1b[?1;2c")
  })

  test("ignores non-matching responses and times out", async () => {
    const router = new InputRouter()
    const terminal = writer()
    const queries = new TerminalQueries(router, terminal)
    const promise = queries.secondaryDeviceAttributes({ timeout: 1 })
    router.dispatch({
      final: "c",
      kind: "csi",
      params: "?1;2",
      sequence: "\x1b[?1;2c",
      type: "term-response",
    })

    await expect(promise).resolves.toBeUndefined()
    expect(terminal.writes).toEqual(["\x1b[>c"])
  })

  test("matches XTVERSION DCS responses", async () => {
    const router = new InputRouter()
    const terminal = writer()
    const queries = new TerminalQueries(router, terminal)
    const promise = queries.xtVersion()

    router.dispatch({
      kind: "dcs",
      payload: ">|Ghostty 1.2.3",
      sequence: "\x1bP>|Ghostty 1.2.3\x1b\\",
      type: "term-response",
    })

    const response = await promise
    expect(terminal.writes).toEqual(["\x1b[>q"])
    expect(response?.name).toBe("Ghostty")
    expect(response?.version).toBe("1.2.3")
  })
})
