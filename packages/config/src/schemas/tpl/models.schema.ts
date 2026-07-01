// oxlint-disable import/no-named-as-default-member

import type { ModelsJson } from "@zaly/ai"

import typia from "typia"

export const ModelsSchema = typia.json.schema<[ModelsJson], "3.0">()
