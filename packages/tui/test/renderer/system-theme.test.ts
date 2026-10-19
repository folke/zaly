import type { TerminalPaletteSnapshot } from "../../src/input/queries.ts"

import { EventEmitter } from "node:events"
import { describe, expect, test, vi } from "vitest"
import { createRenderer } from "../../src/index.ts"
import { defaultTheme, loadTheme } from "../../src/themes/registry.ts"
import { MockWriter } from "./mock.ts"

const flush = () => new Promise<void>((resolve) => setImmediate(resolve))

function io() {
  const stdin = Object.assign(new EventEmitter(), { isTTY: true })
  const stdout = new MockWriter(40, 20)
  let colors: TerminalPaletteSnapshot = {
    ansi: Array.from({ length: 16 }, (_, i) => `#${i.toString(16).repeat(6)}` as const),
    bg: "#181818",
    fg: "#eeeeee",
    selectionBg: "#333333",
    selectionFg: "#ffffff",
  }
  const reply = (payload: string) => stdin.emit("data", `\x1b]${payload}\x07`)
  stdout.write = (sequence) => {
    stdout.log.push(sequence)
    const palette = /^\x1b\]4;(\d+);\?\x1b\\$/.exec(sequence)
    const dynamic = /^\x1b\](10|11|17|19);\?\x1b\\$/.exec(sequence)
    if (palette) {
      const value = colors.ansi[Number(palette[1])]
      if (value) reply(`4;${palette[1]};${value}`)
    } else if (dynamic) {
      const keys = { "10": "fg", "11": "bg", "17": "selectionBg", "19": "selectionFg" } as const
      const value = colors[keys[dynamic[1] as keyof typeof keys]]
      if (value) reply(`${dynamic[1]};${value}`)
    } else if (sequence === "\x1b[?996n") stdin.emit("data", "\x1b[?997;1n")
    return true
  }
  return {
    stdin,
    stdout,
    setColors: (next: TerminalPaletteSnapshot) => {
      colors = next
    },
  }
}

describe("renderer system theme lifecycle", () => {
  test("detects through actual input decoding and refreshes on theme notifications", async () => {
    const terminal = io()
    const r = await createRenderer({
      ...terminal,
      hookSignals: false,
      theme: await loadTheme("system"),
    })
    r.start()
    try {
      await flush()
      expect(r.theme).toMatchObject({ id: "system", bg: "#181818" })
      terminal.setColors({
        ansi: Array.from({ length: 16 }, () => "#222222"),
        bg: "#ffffff",
        fg: "#111111",
        selectionBg: "#dddddd",
        selectionFg: "#111111",
      })
      terminal.stdin.emit("data", "\x1b[?997;2")
      terminal.stdin.emit("data", "n")
      await flush()
      expect(r.theme).toMatchObject({
        id: "system",
        bg: "#ffffff",
        appearance: "light",
        shiki: "auto",
      })
    } finally {
      r.stop()
    }
    expect(terminal.stdout.all).toContain("\x1b[?2031l")
  })

  test("starts tracking lazily without overriding named themes", async () => {
    const terminal = io()
    const r = await createRenderer({ ...terminal, hookSignals: false, theme: defaultTheme })
    r.start()
    try {
      expect(terminal.stdout.all).not.toContain("\x1b[?2031h")
      r.theme = await loadTheme("system")
      await flush()
      expect(r.theme.id).toBe("system")
      r.theme = defaultTheme
      terminal.stdin.emit("data", "\x1b[?997;2n")
      await flush()
      expect(r.theme).toBe(defaultTheme)
      expect(terminal.stdout.all).not.toContain("\x1b[?2031l")
    } finally {
      r.stop()
    }
    expect(terminal.stdout.all).toContain("\x1b[?2031l")
  })

  test("reapplying the system fallback preserves detected colors without querying again", async () => {
    const terminal = io()
    const r = await createRenderer({
      ...terminal,
      hookSignals: false,
      theme: await loadTheme("system"),
    })
    const palette = vi.spyOn(r.queries, "palette")
    r.start()
    try {
      await flush()
      const detected = r.theme
      const queries = palette.mock.calls.length
      r.theme = await loadTheme("system")
      expect(r.theme).toBe(detected)
      expect(r.theme.bg).toBe("#181818")
      await flush()
      expect(r.theme).toBe(detected)
      expect(palette).toHaveBeenCalledTimes(queries)
    } finally {
      r.stop()
    }
  })

  test("theme previews reuse the detected system theme immediately", async () => {
    const terminal = io()
    const r = await createRenderer({
      ...terminal,
      hookSignals: false,
      theme: await loadTheme("system"),
    })
    const palette = vi.spyOn(r.queries, "palette")
    r.start()
    try {
      await flush()
      const detected = r.theme
      const queries = palette.mock.calls.length
      const fallback = await loadTheme("system")
      for (let i = 0; i < 3; i++) {
        r.theme = defaultTheme
        r.theme = fallback
        expect(r.theme).toBe(detected)
      }
      await flush()
      expect(palette).toHaveBeenCalledTimes(queries)
      expect(terminal.stdout.log.filter((sequence) => sequence === "\x1b[?2031h")).toHaveLength(1)
      expect(terminal.stdout.all).not.toContain("\x1b[?2031l")
    } finally {
      r.stop()
    }
  })

  test("terminal changes refresh the cached palette while another theme is selected", async () => {
    const terminal = io()
    const r = await createRenderer({
      ...terminal,
      hookSignals: false,
      theme: await loadTheme("system"),
    })
    const palette = vi.spyOn(r.queries, "palette")
    r.start()
    try {
      await flush()
      r.theme = defaultTheme
      terminal.setColors({
        ansi: Array.from({ length: 16 }, () => "#333333"),
        bg: "#ffffff",
        fg: "#111111",
      })
      terminal.stdin.emit("data", "\x1b[?997;2n")
      await flush()
      expect(r.theme).toBe(defaultTheme)
      const queries = palette.mock.calls.length
      r.theme = await loadTheme("system")
      expect(r.theme).toMatchObject({ bg: "#ffffff", fg: "#111111", appearance: "light" })
      await flush()
      expect(palette).toHaveBeenCalledTimes(queries)
    } finally {
      r.stop()
    }
  })

  test("detects a fresh palette after stop and restart", async () => {
    const terminal = io()
    const r = await createRenderer({
      ...terminal,
      hookSignals: false,
      theme: await loadTheme("system"),
    })
    r.start()
    await flush()
    r.stop()
    terminal.setColors({ ansi: [], bg: "#ffffff" })
    // Unsupported optional colors should not make the test wait for the default timeout.
    const palette = vi.spyOn(r.queries, "palette").mockResolvedValue({ ansi: [], bg: "#ffffff" })
    r.start()
    try {
      await flush()
      expect(palette).toHaveBeenCalled()
      expect(r.theme).toMatchObject({ bg: "#ffffff", appearance: "light" })
    } finally {
      r.stop()
    }
  })

  test.each(["github-dark", "github-light"] as const)(
    "preserves %s highlighting across palette updates and theme switches",
    async (shiki) => {
      const terminal = io()
      const r = await createRenderer({
        ...terminal,
        hookSignals: false,
        shiki,
        theme: await loadTheme("system"),
      })
      r.start()
      try {
        await flush()
        expect(r.theme.shiki).toBe(shiki)
        terminal.setColors({ ansi: [], bg: "#ffffff", fg: "#111111" })
        vi.spyOn(r.queries, "palette").mockResolvedValue({ ansi: [], bg: "#ffffff", fg: "#111111" })
        terminal.stdin.emit("data", "\x1b[?997;2n")
        await flush()
        expect(r.theme.appearance).toBe("light")
        expect(r.theme.shiki).toBe(shiki)
        r.theme = defaultTheme
        expect(r.theme.shiki).toBe(shiki)
      } finally {
        r.stop()
      }
    }
  )

  test("does not query non-interactive output", async () => {
    const terminal = io()
    const stdout = { columns: 40, rows: 20, isTTY: false, write: vi.fn(() => true) }
    const r = await createRenderer({
      stdin: terminal.stdin,
      stdout,
      hookSignals: false,
      theme: await loadTheme("system"),
    })
    r.start()
    try {
      expect(stdout.write.mock.calls.flat().join("")).not.toContain("\x1b[?2031h")
    } finally {
      r.stop()
    }
  })

  test("a stopped renderer cannot be updated by an outstanding query", async () => {
    const terminal = io()
    const r = await createRenderer({
      ...terminal,
      hookSignals: false,
      theme: await loadTheme("system"),
    })
    let finish!: (snapshot: TerminalPaletteSnapshot) => void
    vi.spyOn(r.queries, "palette").mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    r.start()
    r.stop()
    finish({ ansi: [], bg: "#ffffff" })
    await flush()
    expect(r.theme.bg).toBe("inherit")
  })
})
