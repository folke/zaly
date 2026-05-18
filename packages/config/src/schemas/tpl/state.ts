import type { State } from "../../types.ts"

// IMPORTANT: always use typia import directly, otherwise generates code will
// contain actual typia imports
// oxlint-disable import/no-named-as-default-member
import typia from "typia"

const validator = typia.createAssertEquals<State>()

export function validateState(input: unknown): State {
  return validator(input)
}
