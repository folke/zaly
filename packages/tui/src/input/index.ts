import type { ArgsOpts } from "@zaly/shared/args"
import type { Action, ActionDef } from "./actions.ts"

export function defineAction<T extends ArgsOpts = ArgsOpts>(action: ActionDef<T>): ActionDef<T>
export function defineAction<T extends ArgsOpts = ArgsOpts>(action: Action<T>): Action<T>
export function defineAction<T extends ArgsOpts = ArgsOpts>(
  action: ActionDef<T> | Action<T>
): ActionDef<T> | Action<T> {
  return action
}
