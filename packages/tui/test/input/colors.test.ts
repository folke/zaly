import type { TerminalPaletteSnapshot } from "../../src/input/queries.ts"

import { describe, expect, test, vi } from "vitest"
import { ColorsWatcher } from "../../src/input/colors.ts"
import { TerminalQueries } from "../../src/input/queries.ts"
import { InputRouter } from "../../src/input/router.ts"

const snapshot: TerminalPaletteSnapshot = {
  ansi: Array.from({ length: 16 }, (_, i) => `#${i.toString(16).repeat(6)}` as const),
  bg: "#181818",
  fg: "#eeeeee",
}
const flush = () => new Promise<void>((resolve) => setImmediate(resolve))

function setup() {
  const input = new InputRouter()
  const writes: string[] = []
  const write = (sequence: string) => {
    writes.push(sequence)
  }
  const queries = new TerminalQueries(input, { write })
  const palette = vi.spyOn(queries, "palette").mockResolvedValue(snapshot)
  const update = vi.fn()
  const watcher = new ColorsWatcher(queries, input, write, update)
  return { input, palette, update, watcher, writes }
}
function appearance(input: InputRouter, report: number) {
  input.dispatch({
    type: "term-response",
    kind: "csi",
    final: "n",
    params: `?997;${report}`,
    sequence: `\x1b[?997;${report}n`,
  })
}

describe("terminal colors updates", () => {
  test("subscribes, reports raw colors and disables notifications on stop", async () => {
    const { writes, update, watcher } = setup()
    try {
      await flush()
      expect(writes).toContain("\x1b[?2031h")
      expect(writes).toContain("\x1b[?996n")
      expect(update).toHaveBeenCalledTimes(1)
      expect(update).toHaveBeenCalledWith(snapshot, undefined)
    } finally {
      watcher.stop()
    }
    expect(writes.at(-1)).toBe("\x1b[?2031l")
    watcher.stop()
    expect(writes.filter((s) => s === "\x1b[?2031l")).toHaveLength(1)
  })

  test("refreshes on same-appearance notifications as well as light/dark changes", async () => {
    const { input, palette, update, watcher } = setup()
    try {
      await flush()
      palette.mockResolvedValue({ ...snapshot, bg: "#222222" })
      appearance(input, 1)
      await flush()
      expect(update.mock.calls.at(-1)).toEqual([{ ...snapshot, bg: "#222222" }, "dark"])
      palette.mockResolvedValue({ ...snapshot, bg: "#ffffff" })
      appearance(input, 2)
      await flush()
      expect(update.mock.calls.at(-1)).toEqual([{ ...snapshot, bg: "#ffffff" }, "light"])
    } finally {
      watcher.stop()
    }
  })

  test("reports appearance changes independently of palette colors", async () => {
    const { input, update, watcher } = setup()
    try {
      await flush()
      appearance(input, 1)
      await flush()
      appearance(input, 2)
      await flush()
      expect(update).toHaveBeenCalledTimes(3)
      expect(update.mock.calls.at(-1)).toEqual([snapshot, "light"])
    } finally {
      watcher.stop()
    }
  })

  test("queries the current appearance after a bare palette-change notification", async () => {
    const { input, writes, watcher } = setup()
    try {
      await flush()
      input.dispatch({
        type: "term-response",
        kind: "csi",
        final: "n",
        params: "?997",
        sequence: "\x1b[?997n",
      })
      await flush()
      expect(writes.filter((sequence) => sequence === "\x1b[?996n")).toHaveLength(2)
    } finally {
      watcher.stop()
    }
  })

  test("refreshes on focus gain without reapplying identical snapshots", async () => {
    const { input, palette, update, watcher } = setup()
    try {
      await flush()
      input.dispatch({ type: "focus", gained: false })
      expect(palette).toHaveBeenCalledTimes(1)
      input.dispatch({ type: "focus", gained: true })
      await flush()
      expect(palette).toHaveBeenCalledTimes(2)
      expect(update).toHaveBeenCalledTimes(1)
    } finally {
      watcher.stop()
    }
  })

  test("coalesces notifications and discards an obsolete in-flight snapshot", async () => {
    const { input, palette, update, watcher } = setup()
    try {
      await flush()
      let finish!: (value: TerminalPaletteSnapshot) => void
      palette.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve
          })
      )
      appearance(input, 1)
      appearance(input, 2)
      appearance(input, 2)
      palette.mockResolvedValue({ ...snapshot, bg: "#ffffff" })
      finish({ ...snapshot, bg: "#222222" })
      await flush()
      expect(palette).toHaveBeenCalledTimes(3)
      expect(update).toHaveBeenCalledTimes(2)
      expect(update.mock.calls.at(-1)).toEqual([{ ...snapshot, bg: "#ffffff" }, "light"])
    } finally {
      watcher.stop()
    }
  })

  test("stopping discards pending results and unregisters handlers", async () => {
    const { input, palette, update, watcher } = setup()
    watcher.stop()
    await flush()
    appearance(input, 2)
    input.dispatch({ type: "focus", gained: true })
    expect(palette).toHaveBeenCalledTimes(1)
    expect(update).not.toHaveBeenCalled()
  })
})
