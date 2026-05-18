// oxlint-disable import/no-named-as-default-member
import type { Settings } from "../../types.ts"

import typia from "typia"

export const SettingsSchema = typia.json.schema<[Settings], "3.0">()
