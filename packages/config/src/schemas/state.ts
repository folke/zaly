import type { State } from "../types.ts"

import { validate } from "./gen/state.ts"

export function validateState(input: unknown): State {
  return validate(input) as State
}
