import type { Settings } from "../../types.ts"

// IMPORTANT: always use typia import directly, otherwise generates code will
// contain actual typia imports
// oxlint-disable import/no-named-as-default-member
import typia from "typia"

const validator = typia.createAssertEquals<Settings>()

export function validateSettings(input: unknown): Settings {
  return validator(input)
}
