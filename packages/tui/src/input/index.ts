import type { ArgsOpts } from "@zaly/shared/args"
import type { ActionDef } from "./actions.ts"

export function defineAction<T extends ArgsOpts = ArgsOpts>(action: ActionDef<T>): ActionDef<T> {
  return action
}
