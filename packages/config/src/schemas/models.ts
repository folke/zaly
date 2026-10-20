import type { ModelsJson } from "@zaly/ai"

import { validate } from "./gen/models.ts"

export function validateModels(input: unknown): ModelsJson {
  return validate(input) as ModelsJson
}
