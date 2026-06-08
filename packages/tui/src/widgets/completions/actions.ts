import type { ActionDef, Actions } from "../../input/actions.ts"
import type { CompletionSource } from "../autocomplete.ts"
import type { PickerItem } from "../picker.ts"

/** Completion item produced by `actionsSource`. Carries the full
 *  `ActionInfo` plus the action `id` so the source's `accept` can
 *  dispatch without a secondary lookup. Items match the `MenuItem`
 *  contract loosely via the overlapping `name`/... shape. */
export type ActionCompletionItem = ActionDef & PickerItem & { id: string; score: number }

export interface ActionsSourceOptions {
  /** Registry to read from. Usually `renderer.actions`. */
  actions: Actions
  /** Trigger regex. Default: `/^\s*\//` (slash at start of line). */
  trigger?: RegExp
  /** Keep predicate. Default skips `info.hidden`. Return `false` to
   *  drop the entry from the completion list. */
  filter?: (id: string, info: ActionDef) => boolean
}

/**
 * Completion source backed by the `Actions` registry — typical slash
 * command ergonomics. Items are raw `ActionInfo` objects augmented
 * with their `id`; `accept` dispatches the action through the registry
 * and clears the trigger+query range, so the user's typed `/foo` is
 * removed once the action fires (no stale text left in the input).
 *
 * ```ts
 * autocomplete({
 *   input: "chat-input",
 *   sources: {
 *     slash: actionsSource({ actions: renderer.actions }),
 *   },
 * })
 * ```
 */
export function actionsSource(opts: ActionsSourceOptions): CompletionSource<ActionCompletionItem> {
  const trigger = opts.trigger ?? /^\s*\//
  const filter = opts.filter ?? ((_id, info): boolean => !info.hidden && !!info.cmd)

  return {
    accept(item): undefined {
      opts.actions.dispatch(item.id, { source: "autocomplete" })
      return undefined
    },
    complete(_query, match): ActionCompletionItem[] {
      const out: ActionCompletionItem[] = []
      for (const info of opts.actions.list()) {
        if (!filter(info.id, info)) continue
        const name = info.cmd ?? info.id
        const score = match(name)
        if (!score) continue
        out.push({ ...info, id: info.id, name, score, text: name })
      }
      return out
    },
    triggers: [trigger],
  }
}
