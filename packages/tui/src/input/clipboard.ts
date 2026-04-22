import { execSync, spawn } from "node:child_process"
import { mkdtempSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { platform } from "node:process"

/**
 * Read text or image content from the system clipboard.
 *
 * Agent CLIs need this to make `ctrl-v` "just work" — most terminals
 * don't forward clipboard paste events (they only forward typed keys),
 * so the app has to query the OS clipboard itself via the platform's
 * native tool. The detection order mirrors Neovim's clipboard provider:
 *
 *   1. macOS           → `pbpaste` + `osascript` (for images)
 *   2. Wayland         → `wl-paste`
 *   3. X11 (xsel)      → `xsel`
 *   4. X11 (xclip)     → `xclip`
 *   5. WSL             → `win32yank.exe`
 *   6. Windows         → PowerShell `Get-Clipboard`
 *
 * The chosen provider is cached per process.
 *
 * This file is the only place in the package that spawns external
 * processes; everything else is pure. If a probe fails or no tool is
 * available, the public API returns `undefined` and callers should
 * treat it as "clipboard not reachable" rather than an error.
 */

// ---- types -----------------------------------------------------------

/** Image bytes on the clipboard, already written to a temp PNG. */
export interface ClipboardImage {
  kind: "image"
  /** Absolute path to a temporary PNG file. Caller takes ownership. */
  path: string
  /** MIME type. PNG only for now; kept for future formats. */
  type: "image/png"
}

/** One or more file references on the clipboard — what you get when
 *  the user copies a file in their file manager and pastes. */
export interface ClipboardFiles {
  kind: "files"
  /** Absolute filesystem paths. */
  paths: string[]
}

/** Plain text on the clipboard — the common case. */
export interface ClipboardText {
  kind: "text"
  text: string
}

/** Anything the clipboard can hold that this library surfaces. */
export type ClipboardContent = ClipboardImage | ClipboardFiles | ClipboardText

/** One of the content kinds `ClipboardContent` can take. Derived from
 *  the union so adding a new variant doesn't require updating this
 *  alias separately. */
export type ClipboardKind = ClipboardContent["kind"]

/** Internal provider contract. Each backend owns its own "probe types,
 *  pick best, fetch once" logic — on platforms like Wayland and X11
 *  that can enumerate available types, this avoids doing three or four
 *  probe round-trips for every paste.
 *
 *  `read(kind?)` takes an optional hint: when specified, the backend
 *  can skip type enumeration and fetch that kind directly (fast path
 *  for callers that already know what they want). When omitted, the
 *  backend returns the richest available content. `writeText` is
 *  optional since not every backend supports writes. */
interface Provider {
  readonly id: string
  read: (kind?: ClipboardKind) => Promise<ClipboardContent | undefined>
  writeText?: (text: string) => Promise<boolean>
}

/** `true` when this process looks like it's running inside an SSH
 *  session. Native clipboard tools on the remote host would write to
 *  the *remote* clipboard — useless — so we skip them and always emit
 *  OSC 52 instead, which routes through the user's local terminal. */
function isSSH(): boolean {
  return Boolean(process.env.SSH_TTY ?? process.env.SSH_CONNECTION ?? process.env.SSH_CLIENT)
}

// ---- public API ------------------------------------------------------

let cached: Provider | undefined
let cacheResolved = false

/** Detect + cache the clipboard provider for this process. Returns
 *  `undefined` when no provider is available. */
function getClipboard(): Provider | undefined {
  if (cacheResolved) return cached
  cached = detect()
  cacheResolved = true
  return cached
}

/**
 * Read the system clipboard, returning the richest content available.
 *
 * Priority order (decided by each backend internally):
 *   1. **image** — raw image bytes on the clipboard (e.g. a screenshot
 *      from `cmd-shift-4`, or an image copied from a web page).
 *   2. **files** — file URIs (e.g. the user copied a PDF / video in
 *      their file manager).
 *   3. **text** — plain text.
 *
 * Resolves to `undefined` when the clipboard is empty, no provider is
 * available, or every read fails. Never throws — clipboard access is
 * best-effort.
 */
async function readClipboard(): Promise<ClipboardContent | undefined>
async function readClipboard(kind: "text"): Promise<ClipboardText | undefined>
async function readClipboard(kind: "image"): Promise<ClipboardImage | undefined>
async function readClipboard(kind: "files"): Promise<ClipboardFiles | undefined>
async function readClipboard(kind?: ClipboardKind): Promise<ClipboardContent | undefined> {
  const p = getClipboard()
  if (!p) return undefined
  try {
    // Pass the hint through to the backend so it can take a direct
    // fetch path instead of enumerating types. Note: `kind: "text"`
    // still returns whatever's at `text/plain` even when an image or
    // file list is also on the clipboard — file managers / browsers
    // usually provide a text fallback (URL, file path) that's often
    // what the caller wants.
    return await p.read(kind)
  } catch {
    return undefined
  }
}

/** Reset the cached provider — mostly for tests that want to force a
 *  re-probe. Also useful if the environment changes (e.g. Wayland
 *  display started after process boot). */
function resetClipboardCache(): void {
  cached = undefined
  cacheResolved = false
}

/**
 * Copy text to the system clipboard.
 *
 * Policy:
 *   - **SSH session** → always OSC 52. Native tools on the remote box
 *     would write to the remote clipboard, which isn't what the user
 *     wants. OSC 52 routes through the local terminal.
 *   - **Native tool available** → use it (fast, silent, no prompts).
 *   - **Neither** → OSC 52 anyway, fire-and-forget.
 *
 * Resolves to `true` on best-effort delivery; `false` only when we had
 * nothing to try. Note that OSC 52 writes are silent by design — the
 * terminal never confirms receipt — so `true` means "we emitted" not
 * "the user's clipboard definitely has it".
 */
async function writeClipboardText(text: string): Promise<boolean> {
  if (isSSH()) {
    writeOsc52(text)
    return true
  }
  const p = getClipboard()
  if (p?.writeText) {
    try {
      if (await p.writeText(text)) return true
    } catch {
      /* fall through to OSC 52 */
    }
  }
  writeOsc52(text)
  return true
}

/**
 * Namespace export for readable call sites:
 *
 * ```ts
 * import { clipboard } from "@zaly/tui"
 *
 * await clipboard.read()
 * await clipboard.read("text")
 * await clipboard.write("hello")
 * clipboard.reset()
 * ```
 *
 * Equivalent to the individual `readClipboard` / `writeClipboardText` /
 * `resetClipboardCache` exports — use whichever form reads best.
 */
export const clipboard = {
  read: readClipboard,
  reset: resetClipboardCache,
  write: writeClipboardText,
}

/** Emit an OSC 52 clipboard write. Fire-and-forget; some terminals
 *  ignore or prompt on this, and there's no response channel. */
function writeOsc52(text: string): void {
  const b64 = Buffer.from(text, "utf8").toString("base64")
  // `\x1b]52;c;<base64>\x07` — `c` targets the system clipboard.
  process.stdout.write(`\x1b]52;c;${b64}\x07`)
}

// ---- detection -------------------------------------------------------

function detect(): Provider | undefined {
  // macOS: `pbpaste` is always present on macOS. No env check needed.
  if (platform === "darwin" && has("pbpaste")) return macos()

  // Wayland before X11 — XWayland means both vars can be set on a
  // Wayland session, and wl-paste is the right tool there.
  if (process.env.WAYLAND_DISPLAY && has("wl-paste")) return wayland()

  // X11: prefer xsel (nicer selection handling, per Neovim), then xclip.
  if (process.env.DISPLAY) {
    if (has("xsel")) return xsel()
    if (has("xclip")) return xclip()
  }

  // WSL exposes Windows' clipboard via win32yank if the user installed it.
  if (has("win32yank.exe")) return wsl()

  // Plain Windows: PowerShell is always present on supported versions.
  if (platform === "win32") return windows()

  return undefined
}

function has(cmd: string): boolean {
  // `which` on unix, `where` on windows — cheapest portable check.
  const probe = platform === "win32" ? `where ${cmd}` : `command -v ${cmd}`
  try {
    // `execSync` already runs via the shell; no extra option needed.
    execSync(probe, { stdio: "ignore" })
    return true
  } catch {
    return false
  }
}

// ---- backends --------------------------------------------------------

function macos(): Provider {
  return {
    id: "pbpaste",
    read: async (kind) => {
      // macOS has no cheap "list types" call, so when no kind is
      // specified we probe in richness order: image → files → text.
      // Each AppleScript is wrapped in `try…on error` so a miss is
      // an empty string, not a spawn failure.
      if (kind === "image") return macosImage()
      if (kind === "files") return macosFiles()
      if (kind === "text") return macosText()
      const img = await macosImage()
      if (img) return img
      const files = await macosFiles()
      if (files) return files
      return macosText()
    },
    writeText: (text) => runWithInput("pbcopy", [], text),
  }
}

async function macosText(): Promise<ClipboardText | undefined> {
  const text = await run("pbpaste", [])
  return text && text !== "" ? { kind: "text", text } : undefined
}

async function macosImage(): Promise<ClipboardImage | undefined> {
  const script = `
    try
      set png to (the clipboard as «class PNGf»)
      set b64 to do shell script "base64" with input (png as string)
      return b64
    on error
      return ""
    end try
  `
  const out = await run("osascript", ["-e", script])
  if (!out || out.trim() === "") return undefined
  return writeTempPng(Buffer.from(out.trim(), "base64"))
}

async function macosFiles(): Promise<ClipboardFiles | undefined> {
  const script = `
    try
      set theClipboard to the clipboard as «class furl»
      return POSIX path of theClipboard
    on error
      try
        set theList to the clipboard as list
        set posix to ""
        repeat with item_ in theList
          try
            set posix to posix & (POSIX path of item_) & linefeed
          end try
        end repeat
        return posix
      on error
        return ""
      end try
    end try
  `
  const out = await run("osascript", ["-e", script])
  if (!out) return undefined
  const paths = out
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s !== "")
  return paths.length > 0 ? { kind: "files", paths } : undefined
}

function wayland(): Provider {
  return {
    id: "wl-paste",
    read: async (kind) => {
      // Fast path when the caller already knows what it wants — skip
      // `--list-types` enumeration and fetch directly. Empty stdout
      // from wl-paste on a missing type surfaces as `undefined`.
      if (kind === "image") return waylandImage()
      if (kind === "files") return waylandFiles()
      if (kind === "text") return waylandText()
      // Richest-first: one `--list-types` call decides everything.
      const types = await run("wl-paste", ["--list-types"])
      if (!types) return undefined
      if (/\bimage\/png\b/.test(types)) {
        const img = await waylandImage()
        if (img) return img
      }
      if (/\btext\/uri-list\b/.test(types)) {
        const files = await waylandFiles()
        if (files) return files
      }
      return waylandText()
    },
    writeText: (text) => runWithInput("wl-copy", ["--type", "text/plain"], text),
  }
}

async function waylandImage(): Promise<ClipboardImage | undefined> {
  const bytes = await runBinary("wl-paste", ["--type", "image/png"])
  return bytes && bytes.length > 0 ? writeTempPng(bytes) : undefined
}

async function waylandFiles(): Promise<ClipboardFiles | undefined> {
  const paths = parseUriList(await run("wl-paste", ["--type", "text/uri-list"]))
  return paths.length > 0 ? { kind: "files", paths } : undefined
}

async function waylandText(): Promise<ClipboardText | undefined> {
  const text = await run("wl-paste", ["--no-newline"])
  return text && text !== "" ? { kind: "text", text } : undefined
}

function xsel(): Provider {
  // xsel doesn't support MIME-typed targets (no image or file-list
  // reads). When xclip is also installed, delegate non-text reads to
  // it and keep xsel for text only.
  const xclipFallback = has("xclip")
  return {
    id: xclipFallback ? "xsel+xclip" : "xsel",
    read: async (kind) => {
      if (kind === "text") return xselText()
      if (xclipFallback) {
        if (kind === "image") return xclipImage()
        if (kind === "files") return xclipFiles()
        const rich = await xclipRead()
        if (rich && rich.kind !== "text") return rich
      }
      return xselText()
    },
    writeText: (text) => runWithInput("xsel", ["--nodetach", "-i", "-b"], text),
  }
}

function xclip(): Provider {
  return {
    id: "xclip",
    read: (kind) => {
      if (kind === "image") return xclipImage()
      if (kind === "files") return xclipFiles()
      if (kind === "text") return xclipText()
      return xclipRead()
    },
    writeText: (text) => runWithInput("xclip", ["-quiet", "-i", "-selection", "clipboard"], text),
  }
}

async function xclipRead(): Promise<ClipboardContent | undefined> {
  // One TARGETS call covers the whole decision tree.
  const targets = await run("xclip", ["-selection", "clipboard", "-t", "TARGETS", "-o"])
  if (!targets) return undefined
  if (/\bimage\/png\b/.test(targets)) {
    const img = await xclipImage()
    if (img) return img
  }
  if (/\btext\/uri-list\b/.test(targets)) {
    const files = await xclipFiles()
    if (files) return files
  }
  return xclipText()
}

async function xclipImage(): Promise<ClipboardImage | undefined> {
  const bytes = await runBinary("xclip", ["-selection", "clipboard", "-t", "image/png", "-o"])
  return bytes && bytes.length > 0 ? writeTempPng(bytes) : undefined
}

async function xclipFiles(): Promise<ClipboardFiles | undefined> {
  const paths = parseUriList(
    await run("xclip", ["-selection", "clipboard", "-t", "text/uri-list", "-o"])
  )
  return paths.length > 0 ? { kind: "files", paths } : undefined
}

async function xclipText(): Promise<ClipboardText | undefined> {
  const text = await run("xclip", ["-o", "-selection", "clipboard"])
  return text && text !== "" ? { kind: "text", text } : undefined
}

async function xselText(): Promise<ClipboardText | undefined> {
  const text = await run("xsel", ["-o", "-b"])
  return text && text !== "" ? { kind: "text", text } : undefined
}

function wsl(): Provider {
  // win32yank is text-only; image / file paste from WSL would need a
  // different shim, so we only expose text here. `kind === "image"`
  // or `"files"` always resolves to undefined.
  return {
    id: "win32yank",
    read: async (kind) => {
      if (kind === "image" || kind === "files") return undefined
      const text = await run("win32yank.exe", ["-o", "--lf"])
      return text && text !== "" ? { kind: "text", text } : undefined
    },
    writeText: (text) => runWithInput("win32yank.exe", ["-i", "--crlf"], text),
  }
}

function windows(): Provider {
  return {
    id: "powershell",
    read: async (kind) => {
      if (kind === "image") return windowsImage()
      if (kind === "files") return windowsFiles()
      if (kind === "text") return windowsText()
      const img = await windowsImage()
      if (img) return img
      const files = await windowsFiles()
      if (files) return files
      return windowsText()
    },
    writeText: (text) => runWithInput("clip", [], text),
  }
}

async function windowsText(): Promise<ClipboardText | undefined> {
  const text = await run("powershell", ["-NoProfile", "-NoLogo", "-Command", "Get-Clipboard"])
  return text && text !== "" ? { kind: "text", text } : undefined
}

async function windowsImage(): Promise<ClipboardImage | undefined> {
  // PowerShell: fetch image from clipboard, save as PNG to a temp path.
  // Nothing on clipboard → the `if` skips and the file stays empty.
  const tmp = writeTempPath("zaly-clip-", ".png")
  const script = [
    "Add-Type -AssemblyName System.Windows.Forms",
    "$img = [System.Windows.Forms.Clipboard]::GetImage()",
    `if ($img) { $img.Save('${tmp.replace(/\\/g, String.raw`\\`)}') }`,
  ].join("; ")
  await run("powershell", ["-NoProfile", "-NoLogo", "-Command", script])
  try {
    if (statSync(tmp).size > 0) return { kind: "image", path: tmp, type: "image/png" }
  } catch {
    /* no image on clipboard */
  }
  return undefined
}

async function windowsFiles(): Promise<ClipboardFiles | undefined> {
  const out = await run("powershell", [
    "-NoProfile",
    "-NoLogo",
    "-Command",
    "Get-Clipboard -Format FileDropList | ForEach-Object { $_.FullName }",
  ])
  if (!out) return undefined
  const paths = out
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s !== "")
  return paths.length > 0 ? { kind: "files", paths } : undefined
}

// ---- spawn helpers ---------------------------------------------------

interface SpawnResult {
  code: number
  stdout: Buffer
  stderr: Buffer
}

function spawnAsync(cmd: string, args: readonly string[]): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk))
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk))
    child.once("error", reject)
    child.once("close", (code) => {
      resolve({
        code: code ?? 0,
        stderr: Buffer.concat(stderr),
        stdout: Buffer.concat(stdout),
      })
    })
  })
}

async function run(cmd: string, args: readonly string[]): Promise<string | undefined> {
  const { code, stdout } = await spawnAsync(cmd, args)
  if (code !== 0) return undefined
  const text = stdout.toString("utf8")
  return text === "" ? undefined : text
}

async function runBinary(cmd: string, args: readonly string[]): Promise<Buffer | undefined> {
  const { code, stdout } = await spawnAsync(cmd, args)
  if (code !== 0) return undefined
  return stdout.length === 0 ? undefined : stdout
}

/** Spawn a command and pipe `input` to its stdin. Used by all the
 *  clipboard-write backends, which uniformly take the text to copy
 *  via stdin. Resolves to `true` on a clean exit, `false` otherwise. */
function runWithInput(cmd: string, args: readonly string[], input: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: ["pipe", "ignore", "ignore"] })
    child.once("error", () => resolve(false))
    child.once("close", (code) => resolve(code === 0))
    child.stdin.end(input, "utf8")
  })
}

// ---- temp files ------------------------------------------------------

function writeTempPng(bytes: Buffer): ClipboardImage {
  const path = writeTempPath("zaly-clip-", ".png")
  writeFileSync(path, bytes)
  return { kind: "image", path, type: "image/png" }
}

/** Parse a `text/uri-list` blob (RFC 2483): `file://…\r\n` lines, skip
 *  blanks and comment lines (`#…`), decode percent-encoding. Returns
 *  absolute filesystem paths. Non-`file://` URIs are dropped — we
 *  can't hand a remote URL off as an attachment path. */
function parseUriList(raw: string | undefined): string[] {
  if (!raw) return []
  const out: string[] = []
  for (const line of raw.split(/\r?\n/)) {
    const s = line.trim()
    if (s === "" || s.startsWith("#")) continue
    if (!s.startsWith("file://")) continue
    try {
      let path = decodeURIComponent(s.slice("file://".length))
      // `file:///C:/foo` → `/C:/foo` after the slice. Strip the leading
      // slash so we end up with a real Windows path.
      if (/^\/[A-Za-z]:\//.test(path)) path = path.slice(1)
      out.push(path)
    } catch {
      /* malformed URI — skip */
    }
  }
  return out
}

function writeTempPath(prefix: string, ext: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  return join(dir, `clip${ext}`)
}
