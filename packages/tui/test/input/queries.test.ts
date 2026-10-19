import { describe, expect, test, vi } from "vitest"
import { Decoder } from "../../src/input/decoder.ts"
import { parseTerminalColor, TerminalQueries } from "../../src/input/queries.ts"
import { InputRouter } from "../../src/input/router.ts"

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

function osc(router: InputRouter, payload: string) {
  router.dispatch({
    type: "term-response",
    kind: "osc",
    payload,
    sequence: `\x1b]${payload}\x1b\\`,
  })
}

describe("terminal color queries", () => {
  test.each([
    ["rgb:f/0/8", "#ff0088"],
    ["rgb:ff/80/00", "#ff8000"],
    ["rgb:fff/800/000", "#ff8000"],
    ["rgb:ffff/8080/0000", "#ff8000"],
    ["#ABC", "#aabbcc"],
    ["#123456", "#123456"],
    ["rgb:0000/0000/0000", "#000000"],
  ])("parses %s", (input, expected) => {
    expect(parseTerminalColor(input)).toBe(expected)
  })

  test.each(["rgb:gg/00/00", "rgb:fffff/00/00", "rgb:ff/00", "#12345", "?", "red"])(
    "rejects malformed %s",
    (input) => {
      expect(parseTerminalColor(input)).toBeUndefined()
    }
  )

  test("matches palette indices independently, including batched responses", async () => {
    const router = new InputRouter()
    const terminal = writer()
    const queries = new TerminalQueries(router, terminal)
    const first = queries.color(0)
    const second = queries.color(1)
    osc(router, "4;2;rgb:00/ff/00")
    osc(router, "4;1;rgb:ff/00/00;0;rgb:00/00/00")
    expect(await first).toBe("#000000")
    expect(await second).toBe("#ff0000")
    expect(terminal.writes).toEqual(["\x1b]4;0;?\x1b\\", "\x1b]4;1;?\x1b\\"])
    expect(() => queries.color(256)).toThrow()
  })

  test.each([
    [undefined, 100],
    [25, 25],
  ])("palette timeout %s uses %s ms", async (timeout, expected) => {
    const queries = new TerminalQueries(new InputRouter(), writer())
    const color = vi.spyOn(queries, "color").mockResolvedValue(undefined)
    await queries.palette({ timeout })
    expect(color).toHaveBeenCalledTimes(18)
    for (const [, opts] of color.mock.calls) expect(opts?.timeout).toBe(expected)
  })

  test("completes the palette without querying selection colors", async () => {
    const router = new InputRouter()
    const terminal = writer()
    terminal.write = (sequence) => {
      terminal.writes.push(sequence)
      const match = /^\x1b\](4;\d+|10|11);\?\x1b\\$/.exec(sequence)
      if (match) osc(router, `${match[1]};rgb:1111/2222/3333`)
    }
    const queries = new TerminalQueries(router, terminal)
    const palette = await queries.palette()
    expect(palette.ansi).toEqual(Array.from({ length: 16 }, () => "#112233"))
    expect(palette.bg).toBe("#112233")
    expect(palette.fg).toBe("#112233")
    expect(terminal.writes).toHaveLength(18)
    expect(terminal.writes.some((sequence) => /^\x1b\](17|19);/.test(sequence))).toBe(false)
  })

  test("returns partial palettes without inventing unsupported colors", async () => {
    const router = new InputRouter()
    const queries = new TerminalQueries(router, writer())
    const result = queries.palette({ timeout: 1 })
    osc(router, "11;rgb:ff/ff/ff")
    osc(router, "4;0;rgb:00/00/00")
    const palette = await result
    expect(palette.bg).toBe("#ffffff")
    expect(palette.ansi[0]).toBe("#000000")
    expect(palette.ansi[1]).toBeUndefined()
    expect(palette.fg).toBeUndefined()
  })

  test("cancellation resolves outstanding queries and prevents new writes", async () => {
    const router = new InputRouter()
    const terminal = writer()
    const queries = new TerminalQueries(router, terminal)
    const ac = new AbortController()
    const result = queries.color("bg", { signal: ac.signal })
    ac.abort()
    await expect(result).resolves.toBeUndefined()
    await expect(queries.color("fg", { signal: ac.signal })).resolves.toBeUndefined()
    expect(terminal.writes).toHaveLength(1)
    osc(router, "11;rgb:ff/ff/ff")
  })

  test("decodes appearance reports and matches the current scheme", async () => {
    const router = new InputRouter()
    const terminal = writer()
    const queries = new TerminalQueries(router, terminal)
    const result = queries.colorScheme()
    const decoder = new Decoder()
    for (const event of decoder.feed("\x1b[?997;2n")) router.dispatch(event)
    expect(await result).toBe("light")
    expect(terminal.writes).toContain("\x1b[?996n")
  })
})

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
