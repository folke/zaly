import type { Session } from "@zaly/agent/session"
import type { Flags } from "../config.ts"

import { loadState, updateState } from "@zaly/config"

/** Hardcoded last-resort default. Used when there's no `--model`, no
 *  resumed session model, and no persisted `lastModel`. Will be
 *  replaced by an interactive picker once we ship one. */
const FALLBACK_MODEL = "anthropic/claude-sonnet-4-6"

/**
 * Resolve the model id to use for this run. Precedence:
 *
 *   1. `--model X` (explicit user input) — wins always. Persists as
 *      `lastModel` so subsequent invocations default to it.
 *   2. Resumed session's `meta.modelId` — when continuing an existing
 *      conversation, stick with whatever model authored it. **Not**
 *      persisted: looking at history shouldn't silently flip the
 *      user's global default.
 *   3. `~/.zaly/state.json` `lastModel` — the user's implicit
 *      preference from the last time they chose explicitly.
 *   4. `FALLBACK_MODEL` — last-resort hardcoded id. Not persisted.
 *
 * Async because step 3 hits disk. State writes are best-effort and
 * silent — losing the "last model" hint isn't worth a crash.
 */
export async function resolveModelId(flags: Flags, session: Session): Promise<string> {
  if (flags.model !== undefined) {
    await rememberModel(flags.model)
    return flags.model
  }
  const sessionModel = session.settings.modelId
  if (sessionModel !== undefined) return sessionModel
  const state = await loadState()
  if (state.lastModel !== undefined) return state.lastModel
  return FALLBACK_MODEL
}

/** Persist a new "last model" choice — used when the user switches
 *  models mid-session via a future `/model` command. Distinct from
 *  `resolveModelId`'s implicit writes so the call site reads cleanly. */
export async function rememberModel(modelId: string): Promise<void> {
  await updateState({ lastModel: modelId })
}
