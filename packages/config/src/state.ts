import type { State } from "./types.ts"

import { normPath, safeReadJson, writeJson } from "@zaly/shared"
import { zalyPaths } from "@zaly/shared/paths"
import { validateState } from "./schemas/gen/state.ts"
import { merge } from "./utils.ts"

function statePath() {
  return normPath(zalyPaths.state, "state.json")
}

export async function loadState(): Promise<State> {
  const path = statePath()
  const ret = (await safeReadJson(path)) ?? {}
  return validateState(ret)
}

export async function updateState(state: State): Promise<State> {
  const path = statePath()
  return await writeJson<State>(path, (prev) => merge({}, state, prev))
}
