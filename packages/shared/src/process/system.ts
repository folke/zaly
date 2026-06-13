import { platform } from "node:process"
import { delimiter, join } from "pathe"
import { safeStat } from "../utils.ts"

// ── Environment helpers ────────────────────────────────────────────────
const cache = new Map<string, string | undefined>()

export function which(cmd: string, opts: { update?: boolean } = {}): string | undefined {
  if (opts.update) cache.delete(cmd)
  if (!cache.has(cmd)) cache.set(cmd, _which(cmd))
  return cache.get(cmd)
}

/** PATH probe — returns the resolved absolute path of an executable,
 *  or `undefined` when not found. Truthy check works for the
 *  "is X installed?" use case (`if (which("rg")) …`); the path itself
 *  is useful for spawning the exact binary or showing the user where
 *  a tool was resolved.
 *
 *  Synchronous and avoids spawning a subprocess (no `command -v` /
 *  `where` shell-out). Iterates `PATH`, stats each candidate, and
 *  checks the executable bit on POSIX or `PATHEXT` on Windows.
 *
 *  - `cmd` containing a path separator → not searched in PATH; the
 *    given path is checked directly.
 *  - On Windows, falls through `PATHEXT` (defaults to `.COM;.EXE;.BAT;.CMD`)
 *    when `cmd` lacks an extension.
 *  - When running under Bun, defers to `Bun.which()` (native, faster). */
function _which(cmd: string): string | undefined {
  // Bun fast path — native PATH lookup without our manual stat loop.
  // `Bun.which` returns `null` when not found, `string` otherwise.
  const bun = (globalThis as { Bun?: { which?: (cmd: string) => string | null } }).Bun
  if (bun?.which) return bun.which(cmd) ?? undefined

  // Explicit path? Just check it directly — don't search PATH.
  if (cmd.includes("/") || (platform === "win32" && cmd.includes("\\"))) {
    return isExecutable(cmd) ? cmd : undefined
  }

  const pathEnv = process.env.PATH ?? ""
  if (pathEnv === "") return undefined
  const exts = pathExtensions()

  for (const dir of pathEnv.split(delimiter)) {
    if (dir === "") continue
    for (const ext of exts) {
      const candidate = join(dir, cmd + ext)
      if (isExecutable(candidate)) return candidate
    }
  }
  return undefined
}

/** Per-platform extension list to try after the bare command name.
 *  POSIX: empty string (just the literal name). Windows: each entry of
 *  `PATHEXT`, plus an empty leading entry when `cmd` already includes
 *  a dot — so `which("foo.bar")` checks the literal first. */
function pathExtensions(): string[] {
  if (platform !== "win32") return [""]
  const raw = process.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD"
  return raw.split(";").filter((e) => e !== "")
}

function isExecutable(path: string): boolean {
  const s = safeStat(path)
  if (!s || !s.isFile()) return false
  // On Windows, file existence + correct extension is sufficient — the
  // OS uses extension to determine executability. On POSIX, check the
  // execute bit (any of user/group/other).
  if (platform === "win32") return true
  return (Number(s.mode) & 0o111) !== 0
}
