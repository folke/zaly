import type { State } from "./types.ts"

import { safeReadJson, writeJson } from "@zaly/shared"
import { zalyPaths } from "@zaly/shared/paths"
import { validateState } from "./schemas/gen/state.ts"
import { merge } from "./utils.ts"

export async function loadState(): Promise<State> {
  const ret = (await safeReadJson(zalyPaths.state)) ?? {}
  return validateState(ret)
}

export async function updateState(state: State): Promise<State> {
  return await writeJson<State>(zalyPaths.state, (prev) => merge({}, state, prev))
}
