import type { CustomTheme } from "../themes/default.ts"

import { validate } from "./gen/theme.ts"

export function validateTheme(input: unknown): CustomTheme {
  return validate(input) as CustomTheme
}
