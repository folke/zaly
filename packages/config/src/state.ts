import type { State } from "./types.ts"

import { safeReadJson, writeJson } from "@zaly/shared/json"
import { zalyPaths } from "@zaly/shared/paths"
import { merge } from "./utils.ts"

export async function loadState(): Promise<State> {
  const { validateState } = await import("./schemas/gen/state.ts")
  const ret = (await safeReadJson(zalyPaths.state)) ?? {}
  return validateState(ret)
}

export async function updateState(state: State | ((prev?: State) => State)): Promise<State> {
  return await writeJson<State>(
    zalyPaths.state,
    typeof state === "function" ? state : (prev) => merge({}, state, prev)
  )
}
