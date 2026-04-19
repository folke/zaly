import type { Node } from "../core/node.ts"
import type { KeyPattern } from "./keys.ts"

/**
 * Keymap & action-definition machinery.
 *
 * Concepts:
 *   - **Action map** — a plain object of `actionName → zero-arg function`.
 *     Widgets expose one as an `actions` field; the runtime invokes the
 *     function when the configured key binding fires. Having them be
 *     methods-as-data (rather than a Map of strings in some registry)
 *     means callers can also call them directly: `input.actions.submit()`.
 *   - **Action definitions** (`ActionDefs`) — a scoped catalogue of the
 *     available actions with human-facing metadata (`desc`) and a default
 *     list of key patterns (`keys`). The scope prefix (e.g. `"editor"`)
 *     prevents collisions when multiple widgets share action names.
 *   - **Keymap** — the active binding table: `"editor.submit" →
 *     ["enter"]`. Built from the action defaults, with user overrides
 *     layered on top via {@link buildKeymaps}.
 *
 * The types alone can validate most things users get wrong: unknown
 * action names, typos in key patterns, mismatched scopes.
 */

/**
 * A single action. Widget-internal actions (`Input.actions.cursorLeft`)
 * close over `this` and ignore the arg — they're just `() => void` in
 * practice, which is assignable to this type. External / plugin-
 * provided actions receive the target node explicitly.
 */
export type ActionFn<N extends Node = Node> = (node: N) => void

/**
 * A map of named actions. Parameterized by the node type the actions
 * target — `ActionMap<Input>` for Input-specific actions, `ActionMap`
 * (default `Node`) for anything generic.
 */
export type ActionMap<N extends Node = Node> = Record<string, ActionFn<N>>

/**
 * Pull the action set out of anything carrying one: for a class like
 * `Input` with an `actions` field, this returns `Input["actions"]`; for
 * a bare map it returns the map itself.
 */
export type ActionsOf<A> = A extends { actions: infer AA } ? AA : A

/** Metadata + default patterns for a single action. */
export interface ActionInfo {
  /** Human-readable description, used for help screens / config docs. */
  desc: string
  /** Default patterns bound to this action — user overrides replace these. */
  keys: readonly KeyPattern[]
}

/**
 * Scoped catalogue of actions. Keys are `${scope}.${actionName}`;
 * values carry description + default key patterns.
 *
 * ```ts
 * const editorDefs: ActionDefs<"editor", Input> = {
 *   "editor.cursorLeft":  { desc: "move left",  keys: ["left"] },
 *   "editor.deleteWordBack": { desc: "delete prev word", keys: ["ctrl-w"] },
 * }
 * ```
 */
export type ActionDefs<S extends string, A> = Record<
  `${S}.${keyof ActionsOf<A> & string}`,
  ActionInfo
>

/** Resolved keymap: every action gets at least its default patterns. */
export type Keymaps<Defs> = { [K in keyof Defs]: readonly KeyPattern[] }

/** Partial keymap shape — what a user config file would produce. */
export type KeymapOverrides<Defs> = Partial<Keymaps<Defs>>

/**
 * Merge user overrides with the action defaults to produce a complete
 * keymap. Every action key is guaranteed to have at least an empty list
 * of patterns (or its default if the override doesn't touch it), so the
 * dispatch layer can assume exhaustiveness.
 */
export function buildKeymaps<Defs extends Record<string, ActionInfo>>(
  defs: Defs,
  overrides: KeymapOverrides<Defs> = {},
): Keymaps<Defs> {
  const out = {} as { [K in keyof Defs]: readonly KeyPattern[] }
  for (const key of Object.keys(defs) as (keyof Defs)[]) {
    out[key] = overrides[key] ?? defs[key].keys
  }
  return out
}
