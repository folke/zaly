import type { KeyPatterns } from "@zaly/tui"
import type { Config, ConfigInput } from "../types.ts"

import { canonical } from "@zaly/tui"
import { validate } from "./gen/config.ts"

export function validateConfig(input: unknown): Config {
  const ret = validate(input) as ConfigInput
  const keymap: Record<string, KeyPatterns> = {}
  for (const [action, pattern] of Object.entries(ret.keymap ?? {})) {
    keymap[action] = typeof pattern === "string" ? canonical(pattern) : pattern.map(canonical)
  }
  return { ...ret, keymap }
}
