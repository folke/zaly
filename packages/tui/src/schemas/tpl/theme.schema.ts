// oxlint-disable import/no-named-as-default-member
import type { CustomTheme } from "../../themes/default.ts"

import typia from "typia"

export const ThemeSchema = typia.json.schema<CustomTheme, "3.0">()
