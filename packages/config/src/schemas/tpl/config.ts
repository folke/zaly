import type { KeyPatterns } from "@zaly/tui"
import type { Config, TypiaConfig } from "../../types.ts"

import { canonical } from "@zaly/tui"
// IMPORTANT: always use typia import directly, otherwise generates code will
// contain actual typia imports
// oxlint-disable import/no-named-as-default-member
import typia from "typia"

const validator = typia.createAssertEquals<TypiaConfig>()

export function validateConfig(input: unknown): Config {
  const ret = validator(input)
  const keymap: Record<string, KeyPatterns> = {}
  for (const [action, pattern] of Object.entries(ret.keymap ?? {})) {
    if (typeof pattern === "string") keymap[action] = canonical(pattern)
    else if (Array.isArray(pattern)) keymap[action] = pattern.map(canonical)
    else throw new TypeError(`invalid key pattern for action ${action}`)
  }
  return { ...ret, keymap }
}
