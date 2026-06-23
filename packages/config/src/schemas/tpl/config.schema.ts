// oxlint-disable import/no-named-as-default-member
import type { TypiaConfig } from "../../types.ts"

import typia from "typia"

export const ConfigSchema = typia.json.schema<[TypiaConfig], "3.0">()
