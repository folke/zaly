/**
 * Terminal image-protocol detection. We pick the best inline-graphics
 * protocol the current terminal speaks, or `undefined` if none. The
 * `Image` node branches on this to encode the right escape sequence.
 *
 * Kitty Graphics Protocol (KGP): kitty, ghostty, wezterm, rio, warp,
 *   recent iTerm2 (3.6+), recent Konsole. Needs PNG data (native) —
 *   we handle non-PNG via sharp conversion.
 * iTerm2 Inline Images: iTerm2 (2.9.20150512+), VS Code (1.80+), Rio
 *   (0.1.13+), Mintty, Konsole (22.04+), recent WezTerm. Accepts raw
 *   bytes in any format the terminal recognises — no conversion needed.
 */

export type ImageProtocol = "kitty" | "iterm2"

export interface ImageCapabilities {
  /** Best-supported inline image protocol, or undefined when none works. */
  protocol: ImageProtocol | undefined
}

let cached: ImageCapabilities | undefined

export function imageCapabilities(): ImageCapabilities {
  return (cached ??= detect())
}

export function resetCapabilitiesCache(): void {
  cached = undefined
}

/**
 * True when we're talking to the terminal through an SSH session, i.e.
 * the client and the terminal emulator don't share a filesystem. KGP's
 * `t=f` (transmit by file path) doesn't work in that case — the
 * terminal would try to read a path that doesn't exist on its side —
 * so callers must fall back to `t=d` bytes-in-band.
 */
export function isRemoteSession(): boolean {
  if (typeof process === "undefined") return false
  const env = process.env
  return Boolean(env.SSH_CLIENT ?? env.SSH_CONNECTION ?? env.SSH_TTY)
}

type Env = Record<string, string | undefined>

interface Version {
  major: number
  minor: number
  patch: number
}

function parseVersion(s: string | undefined): Version {
  const [a = 0, b = 0, c = 0] = (s ?? "").split(".").map((n) => Number.parseInt(n, 10) || 0)
  return { major: a, minor: b, patch: c }
}

function gte(actual: Version, min: Version): boolean {
  if (actual.major !== min.major) return actual.major > min.major
  if (actual.minor !== min.minor) return actual.minor > min.minor
  return actual.patch >= min.patch
}

function v(major: number, minor = 0, patch = 0): Version {
  return { major, minor, patch }
}

function konsoleVersion(env: Env): number {
  return Number.parseInt(env.KONSOLE_VERSION ?? "0", 10) || 0
}

function isWezTerm(env: Env): boolean {
  const tp = env.TERM_PROGRAM?.toLowerCase()
  const lc = env.LC_TERMINAL?.toLowerCase()
  return (
    Boolean(env.WEZTERM_PANE ?? env.WEZTERM_UNIX_SOCKET) || tp === "wezterm" || lc === "wezterm"
  )
}

function supportsKitty(env: Env): boolean {
  if (isWezTerm(env)) return true
  if (env.KITTY_WINDOW_ID || env.KITTY_PID) return true
  if (env.GHOSTTY_RESOURCES_DIR) return true

  const tp = env.TERM_PROGRAM?.toLowerCase() ?? ""
  if (tp === "kitty" || tp === "ghostty" || tp === "rio" || tp === "warpterminal") return true

  // iTerm2 added KGP support in 3.6.
  if (tp === "iterm.app") return gte(parseVersion(env.TERM_PROGRAM_VERSION), v(3, 6))
  // Konsole added KGP support in 22.04 (encoded as 220400).
  if (tp === "konsole" || env.KONSOLE_VERSION) return konsoleVersion(env) >= 220_400

  const term = env.TERM ?? ""
  return /kitty/i.test(term) || term === "xterm-ghostty"
}

function supportsIterm2(env: Env): boolean {
  const tp = env.TERM_PROGRAM?.toLowerCase() ?? ""

  // iTerm2 itself — the protocol originated in 2.9.20150512.
  if (tp === "iterm.app") return gte(parseVersion(env.TERM_PROGRAM_VERSION), v(2, 9, 20_150_512))
  // VS Code added OSC 1337 inline-image support in 1.80.
  if (tp === "vscode") return gte(parseVersion(env.TERM_PROGRAM_VERSION), v(1, 80))
  // Rio shipped iTerm2 images in 0.1.13.
  if (tp === "rio") return gte(parseVersion(env.TERM_PROGRAM_VERSION), v(0, 1, 13))
  if (tp === "mintty") return true
  // Konsole handles iTerm2 images from 22.04 onwards.
  if (tp === "konsole" || env.KONSOLE_VERSION) return konsoleVersion(env) >= 220_400

  // SSH-friendly: some terminals relay identity via LC_TERMINAL because
  // TERM_PROGRAM doesn't survive `ssh` by default. ITERM_SESSION_ID is a
  // stronger signal iTerm2 itself sets and preserves.
  if (env.LC_TERMINAL?.toLowerCase() === "iterm2") return true
  if (env.ITERM_SESSION_ID) return true
  return false
}

function detect(): ImageCapabilities {
  if (typeof process === "undefined") return { protocol: undefined }
  const env = process.env as Env

  // tmux / screen swallow most image sequences unless passthrough is set
  // up. We don't try to paper over that — leave protocol undefined so
  // callers get the fallback path instead of broken output.
  const term = env.TERM?.toLowerCase() ?? ""
  const inMux = Boolean(env.TMUX) || term.startsWith("tmux") || term.startsWith("screen")
  if (inMux) return { protocol: undefined }

  // Non-TTY output (pipes, file redirects, CI logs) — emitting escape
  // sequences is just noise there, so skip detection entirely.
  if (!process.stdout.isTTY) return { protocol: undefined }

  // Prefer KGP when available — it supports placements (flicker-free
  // re-renders) and file-path transmission (zero-copy for local PNG).
  if (supportsKitty(env)) return { protocol: "kitty" }
  if (supportsIterm2(env)) return { protocol: "iterm2" }
  return { protocol: undefined }
}
