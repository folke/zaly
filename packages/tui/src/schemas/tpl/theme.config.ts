import type { Theme } from "../../style/theme.ts"

import { createAssertEquals } from "typia"

const validator = createAssertEquals<Partial<Theme> & { $schema?: string }>()
export const validateTheme = (input: unknown) => validator(input)
