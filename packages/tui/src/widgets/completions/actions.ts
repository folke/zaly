import type { ActionDef, Actions } from "../../input/actions.ts"
import type { CompletionSource, Matcher } from "../autocomplete.ts"
import type { MenuRender } from "../menu.ts"

import { stringWidth } from "@zaly/shared/ansi"

/** Completion item produced by `actionsSource`. Carries the full
 *  `ActionInfo` plus the action `id` so the source's `accept` can
 *  dispatch without a secondary lookup. Items match the `MenuItem`
 *  contract loosely via the overlapping `name`/... shape. */
export type ActionCompletionItem = ActionDef & { id: string }

export interface ActionsSourceOptions {
  /** Registry to read from. Usually `renderer.actions`. */
  actions: Actions
  /** Trigger regex. Default: `/^\s*\//` (slash at start of line). */
  trigger?: RegExp
  /** Keep predicate. Default skips `info.hidden`. Return `false` to
   *  drop the entry from the completion list. */
  filter?: (id: string, info: ActionDef) => boolean
}

const defaultRender: MenuRender<ActionCompletionItem> = (item, _active, ctx) => {
  const name = item.cmd ?? item.id
  const desc = item.desc ?? ""
  const gap = 2
  // Label column: widest name wins; capped at half width so a long
  // name doesn't crowd out the hint. Hint fills the remainder.
  const labelW = Math.min(Math.max(stringWidth(name), 10), Math.floor(ctx.width / 2))
  const pad = Math.max(0, labelW - stringWidth(name))
  return ctx.style.add("menuLabel")(name) + " ".repeat(pad + gap) + ctx.style.add("menuHint")(desc)
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
  const filter = opts.filter ?? ((_id, info): boolean => !info.hidden)

  return {
    accept(item): undefined {
      opts.actions.dispatch(item.id, { source: "autocomplete" })
      return undefined
    },
    complete(_query: string, match: Matcher): ActionCompletionItem[] {
      const out: ActionCompletionItem[] = []
      for (const info of opts.actions.list()) {
        if (!filter(info.id, info)) continue
        const name = info.cmd ?? info.id
        if (!match(name)) continue
        out.push({ ...info, id: info.id })
      }
      return out
    },
    render: defaultRender,
    triggers: [trigger],
  }
}
