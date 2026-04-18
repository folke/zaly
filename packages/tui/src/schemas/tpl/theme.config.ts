import type { Theme } from "../../style/theme.ts"

import { createAssertEquals } from "typia"

const validator = createAssertEquals<Theme>()
export const validateTheme = (input: unknown) => validator(input)
