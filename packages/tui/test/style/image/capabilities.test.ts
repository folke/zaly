import { afterEach, beforeAll, describe, expect, test } from "vitest"
import {
  imageCapabilities,
  resetCapabilitiesCache,
} from "../../../src/style/image/capabilities.ts"

// The test runner's stdout isn't a TTY, so detection would otherwise
// short-circuit to `undefined`. Pretend it is for the duration of the
// suite — each test still controls detection via its env patch.
beforeAll(() => {
  Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: true })
})

function withEnv<T>(patch: Record<string, string | undefined>, fn: () => T): T {
  const saved: Record<string, string | undefined> = {}
  for (const k of Object.keys(patch)) saved[k] = process.env[k]
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  try {
    return fn()
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  }
}

// Every relevant env var must be forced to a known state per test —
// anything left from the runner's environment (e.g. GHOSTTY_RESOURCES_DIR
// on the dev machine) silently swings detection the wrong way.
const NULL_ENV = {
  GHOSTTY_RESOURCES_DIR: undefined,
  ITERM_SESSION_ID: undefined,
  KITTY_PID: undefined,
  KITTY_WINDOW_ID: undefined,
  KONSOLE_VERSION: undefined,
  LC_TERMINAL: undefined,
  TERM: undefined,
  TERM_PROGRAM: undefined,
  TERM_PROGRAM_VERSION: undefined,
  TMUX: undefined,
  WEZTERM_PANE: undefined,
  WEZTERM_UNIX_SOCKET: undefined,
}

afterEach(() => resetCapabilitiesCache())

describe("imageCapabilities", () => {
  test("kitty via KITTY_WINDOW_ID → protocol=kitty", () => {
    const caps = withEnv({ ...NULL_ENV, KITTY_WINDOW_ID: "1", TERM: "xterm" }, () => {
      resetCapabilitiesCache()
      return imageCapabilities()
    })
    expect(caps.protocol).toBe("kitty")
  })

  test("kitty via TERM_PROGRAM=kitty", () => {
    const caps = withEnv({ ...NULL_ENV, TERM: "xterm-kitty", TERM_PROGRAM: "kitty" }, () => {
      resetCapabilitiesCache()
      return imageCapabilities()
    })
    expect(caps.protocol).toBe("kitty")
  })

  test("ghostty via GHOSTTY_RESOURCES_DIR", () => {
    const caps = withEnv(
      {
        ...NULL_ENV,
        GHOSTTY_RESOURCES_DIR: "/opt/ghostty",
        TERM: "xterm-256color",
        TERM_PROGRAM: "ghostty",
      },
      () => {
        resetCapabilitiesCache()
        return imageCapabilities()
      }
    )
    expect(caps.protocol).toBe("kitty")
  })

  test("wezterm → protocol=kitty (WezTerm speaks KGP)", () => {
    const caps = withEnv(
      { ...NULL_ENV, TERM: "xterm-256color", TERM_PROGRAM: "WezTerm", WEZTERM_PANE: "0" },
      () => {
        resetCapabilitiesCache()
        return imageCapabilities()
      }
    )
    expect(caps.protocol).toBe("kitty")
  })

  test("iTerm2 via ITERM_SESSION_ID → protocol=iterm2", () => {
    const caps = withEnv({ ...NULL_ENV, ITERM_SESSION_ID: "w0t0p0:1", TERM: "xterm-256color" }, () => {
      resetCapabilitiesCache()
      return imageCapabilities()
    })
    expect(caps.protocol).toBe("iterm2")
  })

  test("tmux disables protocol even when inner terminal supports it", () => {
    const caps = withEnv(
      { KITTY_WINDOW_ID: "1", TERM: "tmux-256color", TERM_PROGRAM: "kitty", TMUX: "/tmp/tmux-0" },
      () => {
        resetCapabilitiesCache()
        return imageCapabilities()
      }
    )
    expect(caps.protocol).toBeUndefined()
  })

  test("plain xterm → no protocol", () => {
    const caps = withEnv({ ...NULL_ENV, TERM: "xterm-256color" }, () => {
      resetCapabilitiesCache()
      return imageCapabilities()
    })
    expect(caps.protocol).toBeUndefined()
  })
})
