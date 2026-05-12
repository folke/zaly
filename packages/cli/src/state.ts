import { zalyPaths } from "@zaly/agent"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname } from "pathe"

/**
 * Cross-run user state — what we remember between zaly invocations
 * that isn't a session, isn't config (user-editable), and isn't a
 * credential. Just preferences that the CLI updates implicitly:
 * last model used, last theme picked, future bits.
 *
 * Stored as a single JSON file at `zalyPaths.state` (`~/.zaly/state.json`
 * by default). Read with a missing-file fallback; write atomically
 * enough — single small JSON write, no temp-file dance for now.
 */
export interface AppState {
  /** Last model used. Becomes the default for new sessions when no
   *  `--model` is passed and no resumed session has its own. */
  lastModel?: string
}

/** Read user state. Returns an empty object when the file is missing
 *  or malformed — state is best-effort, never fatal. */
export async function readState(): Promise<AppState> {
  try {
    const raw = await readFile(zalyPaths.state, "utf8")
    const parsed = JSON.parse(raw) as unknown
    return typeof parsed === "object" && parsed !== null ? (parsed as AppState) : {}
  } catch {
    return {}
  }
}

/** Patch user state. Reads, merges, writes. Creates the parent dir
 *  if missing. Swallows write errors — losing the "last model picked"
 *  hint isn't worth crashing the CLI for. */
export async function writeState(patch: Partial<AppState>): Promise<void> {
  try {
    const current = await readState()
    const next = { ...current, ...patch }
    await mkdir(dirname(zalyPaths.state), { recursive: true })
    await writeFile(zalyPaths.state, `${JSON.stringify(next, undefined, 2)}\n`, "utf8")
  } catch {
    // Best-effort.
  }
}
