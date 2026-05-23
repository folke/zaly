// oxlint-disable import/no-named-as-default-member
import type { TypiaSettings } from "../../types.ts"

import typia from "typia"

export const SettingsSchema = typia.json.schema<[TypiaSettings], "3.0">()
