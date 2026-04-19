/**
 * Terminal image-protocol detection. We pick the best inline-graphics
 * protocol the current terminal speaks, or `undefined` if none. The
 * `Image` node branches on this to encode the right escape sequence.
 *
 * Kitty Graphics Protocol (KGP): kitty, ghostty, wezterm. Needs PNG data
 *   (native), we handle non-PNG via sharp conversion.
 * iTerm2 Inline Images: iTerm2 (and a handful of clones). Accepts raw
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

function detect(): ImageCapabilities {
  if (typeof process === "undefined") return { protocol: undefined }

  const env = process.env
  const termProgram = env.TERM_PROGRAM?.toLowerCase() ?? ""
  const term = env.TERM?.toLowerCase() ?? ""

  // tmux / screen swallow most image sequences unless passthrough is set up.
  // We don't try to paper over that — leave protocol undefined so callers
  // get the fallback path instead of broken output.
  const inMux = Boolean(env.TMUX) || term.startsWith("tmux") || term.startsWith("screen")
  if (inMux) return { protocol: undefined }

  // Kitty / ghostty / wezterm all speak KGP. We prefer KGP where available
  // because it supports placements (flicker-free re-renders) and file-path
  // transmission (zero-copy for local PNG).
  if (env.KITTY_WINDOW_ID || termProgram === "kitty") return { protocol: "kitty" }
  if (termProgram === "ghostty" || term.includes("ghostty") || env.GHOSTTY_RESOURCES_DIR) {
    return { protocol: "kitty" }
  }
  if (env.WEZTERM_PANE || termProgram === "wezterm") return { protocol: "kitty" }

  // iTerm2 inline images — single-escape, accepts PNG/JPEG/GIF/WebP bytes
  // directly. No placements, so re-renders retransmit, but for static
  // layouts it's just as good as KGP.
  if (env.ITERM_SESSION_ID || termProgram === "iterm.app") return { protocol: "iterm2" }

  return { protocol: undefined }
}
