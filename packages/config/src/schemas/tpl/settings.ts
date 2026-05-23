import type { KeyPatterns } from "@zaly/tui"
import type { Settings, TypiaSettings } from "../../types.ts"

import { canonical } from "@zaly/tui"
// IMPORTANT: always use typia import directly, otherwise generates code will
// contain actual typia imports
// oxlint-disable import/no-named-as-default-member
import typia from "typia"

const validator = typia.createAssertEquals<TypiaSettings>()

export function validateSettings(input: unknown): Settings {
  const ret = validator(input)
  const bindings: Record<string, KeyPatterns> = {}
  for (const [action, pattern] of Object.entries(ret.bindings ?? {})) {
    if (typeof pattern === "string") bindings[action] = canonical(pattern)
    else if (Array.isArray(pattern)) bindings[action] = pattern.map(canonical)
    else throw new TypeError(`invalid key pattern for action ${action}`)
  }
  return { ...ret, bindings }
}
