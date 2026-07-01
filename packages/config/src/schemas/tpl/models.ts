// IMPORTANT: always use typia import directly, otherwise generates code will
// contain actual typia imports
// oxlint-disable import/no-named-as-default-member
import type { ModelsJson } from "@zaly/ai"

import typia from "typia"

const validator = typia.createAssertEquals<ModelsJson>()

export function validateModels(input: unknown): ModelsJson {
  return validator(input)
}
