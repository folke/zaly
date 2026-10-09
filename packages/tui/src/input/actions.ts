import type { MaybePromise } from "@zaly/shared"
import type { ArgsOpts, ArgsResult } from "@zaly/shared/args"
import type { Node } from "../core/node.ts"
import type { KeyPattern } from "./keys.ts"
import type { RoutedKey } from "./router.ts"

import { Emitter } from "@zaly/shared"
import { Logger } from "@zaly/shared/logger"
import { canonical } from "./keys.ts"

/**
 * Context handed to every action handler. Whether the action was
 * fired by a key, programmatic dispatch, command palette, or a plugin,
 * handlers see a uniform payload.
 */
export type ActionCtx<T extends ArgsOpts = ArgsOpts, N = void> = {
  /** The action id being dispatched. */
  readonly id: string
  readonly node?: Node
  /** The node dispatch started from — typically the focused node for
   *  key- or palette-triggered actions. `undefined` for purely
   *  programmatic dispatch with no anchor. */
  readonly target?: Node
  /** What triggered the dispatch. Open string for extensibility. */
  readonly source: "key" | "programmatic" | (string & {})
  /** When `source === "key"`, the originating routed key event. */
  readonly key?: RoutedKey
  args?: ArgsResult<T>
} & (N extends Node
  ? {
      /** The node whose `actions[id]` handler matched, or `undefined` when
       *  the action was handled by a catalog-level `fn` (not tied to a
       *  specific node). */
      readonly node: N
    }
  : {})

export type ActionFn<T extends ArgsOpts = ArgsOpts, N = void> = (
  ctx: ActionCtx<T, N>
) => MaybePromise<unknown>

export type KeyBinding = Omit<ActionDef, "fn" | "keys"> & {
  id: string
  fn: ActionFn
  keys: string | readonly string[]
}

/**
 * Metadata + default bindings for a single action. Used as catalog
 * entries inside the `Actions` registry.
 *
 * - `desc` / `name`: human-facing copy for help screens, command palette.
 * - `keys`: default key pattern(s). The registry builds the router's
 *   keymap from these so apps don't have to wire bindings themselves.
 * - `hidden`: omit from command palette enumeration.
 * - `fn`: optional handler. When present, `dispatch(id)` calls it
 *   directly (used for global/app actions that aren't anchored to a
 *   widget instance). When absent, dispatch walks the focus chain
 *   looking for a node with `actions[id]`.
 */
export interface ActionDef<T extends ArgsOpts = ArgsOpts, N = void> {
  cmd?: string
  desc?: string
  keys?: readonly string[]
  hidden?: boolean
  args?: T
  source?: string
  fn?: ActionFn<T, N>
  /** Optional numeric priority for ordering in the command palette.
   * Higher number is higher priority. Defaults to 0 */
  priority?: number
}

export type Action<T extends ArgsOpts = ArgsOpts, N = void> = ActionDef<T, N> & { id: string }

export type ActionMap = Record<string, ActionDef>

export type ActionFilter = {
  cmd?: string
  id?: string | RegExp
  hidden?: boolean
  source?: string
  filter?: (info: Action) => boolean
}

function filterAction(action?: Action, filter?: ActionFilter): action is Action {
  if (!action) return false
  if (!filter) return true
  if (filter.cmd && filter.cmd !== action.cmd) return false
  if (filter.id) {
    if (typeof filter.id === "string" && filter.id !== action.id) return false
    if (filter.id instanceof RegExp && !filter.id.test(action.id)) return false
  }
  if (filter.hidden !== undefined && filter.hidden !== (action.hidden ?? false)) return false
  if (filter.filter && !filter.filter(action)) return false
  if (filter.source && filter.source !== action.source) return false
  return true
}

/** A single entry in a Node's `actions` dict.
 *
 *  Either a bare handler — the historical form, ideal for built-in
 *  widgets whose metadata lives in `defaultActions` — or the full
 *  `ActionInfo` shape (with a *required* `fn`). The object form lets
 *  widget / plugin authors colocate desc + keys + impl in one place;
 *  on mount, the metadata (everything except `fn`) is auto-registered
 *  into `ctx.actions` with `extend: false`, so it contributes defaults
 *  without clobbering anything the user already configured. */
export type NodeAction<T extends Node = Node> =
  | ActionFn<ArgsOpts, T>
  | (ActionDef<ArgsOpts, T> & { fn: ActionFn<ArgsOpts, T> })

/** Shape of a Node's `actions` dict — full action ids as keys. */
export type NodeActionMap<T extends Node = Node> = Record<string, NodeAction<T>>

type ActionEvents = {
  change: {}
}

/**
 * Runtime registry of action metadata + impls.
 *
 * `register(entries)` merges new `ActionInfo` objects into the catalog
 * by id — passing `{ "x": { keys: [...] } }` updates only the `keys`
 * field of `x`, preserving existing `fn`/`desc`. That lets docs,
 * bindings, and impls be registered in separate calls / from different
 * layers (bundled defaults, app-level overrides, plugin contributions).
 *
 * `dispatch(id, ctx)` runs the action:
 *   - If the catalog entry has `fn`, it's called directly (global
 *     actions).
 *   - Otherwise, the focus chain is walked from `ctx.target` (default:
 *     the router's focused node) up to the root, and the first node
 *     with `actions[id]` handles it.
 *
 * `list()` returns the catalog for command palette / help enumeration.
 */
export class Actions extends Emitter<ActionEvents> {
  readonly #catalog = new Map<string, Action>()
  /** Optional focus-chain walker. Supplied by the Renderer so Actions
   *  doesn't have to know about the router directly. Returns the
   *  starting node (focused by default) so dispatch can walk up. */
  #getTarget: () => Node | undefined = () => undefined
  #logger: Logger
  #keymap = new Map<KeyPattern, string[]>()

  constructor(logger?: Logger) {
    super()
    this.#logger = logger ?? new Logger()
    this.on("change", () => this.#updateKeymap())
  }

  /** Internal — the Renderer wires this after construction. */
  setTargetResolver(fn: () => Node | undefined): void {
    this.#getTarget = fn
  }

  bind(binding: KeyBinding): () => void {
    const { id, keys, ...info } = binding
    return this.register({
      [id]: {
        ...info,
        keys: (Array.isArray(keys) ? keys : [keys]).map((k) => canonical(k)),
      },
    })
  }

  /**
   * Register or merge catalog entries. Values are shallow-merged into
   * existing entries by id.
   *
   * When `opts.default` is `true`, the new entry is merged *before* the
   * existing one, so it provides defaults.
   *
   * When `opts.default` is `false` (the default), the new entry is merged
   * *after* the existing one, so it overrides prior values.
   *
   * Returns an unregister function that rolls this call back.
   */
  register(actions: ActionMap | Action[], opts: { default?: boolean } = {}): () => void {
    const entries = Array.isArray(actions)
      ? Object.fromEntries(actions.map((a) => [a.id, a]))
      : actions
    const isDefault = opts.default ?? false
    const ids = Object.keys(entries)
    const prior = new Map<string, Action | undefined>()
    for (const id of ids) prior.set(id, this.#catalog.get(id))
    for (const [id, info] of Object.entries(entries)) {
      info.keys = info.keys?.map((k) => canonical(k))
      const existing = this.#catalog.get(id)
      this.#catalog.set(id, isDefault ? { ...info, ...existing, id } : { ...existing, ...info, id })
    }
    void this.emit("change")
    return () => {
      for (const id of ids) {
        const before = prior.get(id)
        if (before === undefined) this.#catalog.delete(id)
        else this.#catalog.set(id, before)
      }
      void this.emit("change")
    }
  }

  /** Remove entries by id. */
  delete(filter: string[] | ActionFilter): void {
    const ids = Array.isArray(filter) ? filter : this.list(filter).map((a) => a.id)
    let changed = false
    for (const id of ids) {
      if (this.#catalog.delete(id)) changed = true
    }
    if (changed) void this.emit("change")
  }

  get(id: string): Action | undefined {
    return this.#catalog.get(id)
  }

  list(opts?: ActionFilter): Action[] {
    return [...this.#catalog.values()].filter((action) =>
      opts ? filterAction(action, opts) : true
    )
  }

  find(opts?: ActionFilter): Action | undefined {
    return this.list(opts)[0]
  }

  /**
   * Fire the action `id`. Returns `true` if anything handled it.
   *
   * Order:
   *   1. If the catalog entry has `fn`, call it with the full ctx.
   *   2. Otherwise walk `target` → root and fire the first node's
   *      `actions[id]`.
   *   3. Return `false` if nothing consumed.
   */
  dispatch(id: string, ctx?: Partial<ActionCtx>): boolean
  // oxlint-disable-next-line typescript/unified-signatures
  dispatch(action: Action, ctx?: Partial<ActionCtx>): boolean
  dispatch(idOrAction: string | Action, partial: Partial<ActionCtx> = {}): boolean {
    const id = typeof idOrAction === "string" ? idOrAction : idOrAction.id
    const action = typeof idOrAction === "string" ? this.#catalog.get(id) : idOrAction
    const target = partial.target ?? this.#getTarget()
    const source = partial.source ?? "programmatic"
    if (action?.fn) {
      const ctx: ActionCtx = { id, source, target, ...partial }
      const fn = action.fn
      this.#logger.try(() => fn(ctx), { id, name: "dispatch", source })
      return true
    }
    for (let node: Node | undefined = target; node !== undefined; node = node.parent) {
      if (!node.isVisible() || !node.mounted) continue
      const entry = node.actions?.[id]
      const fn = typeof entry === "function" ? entry : entry?.fn
      if (typeof fn === "function") {
        const ctx = { id, node, source, target, ...partial }
        this.#logger.try(() => fn(ctx), { id, name: "dispatch", source })
        return true
      }
    }
    return false
  }

  dispatchKey(routed: RoutedKey, opts: { node?: boolean; global?: boolean } = {}): boolean {
    if (routed.eventType === "release") return true

    const patterns = [routed.pattern]
    if (routed.base !== undefined) patterns.push(canonical({ ...routed, name: routed.base }))
    const actions = [
      ...new Set(patterns.flatMap((pattern) => this.#keymap.get(canonical(pattern)) ?? [])),
    ]
      .map((id) => this.get(id))
      .filter((a) => filterAction(a))
      .toSorted((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
    if (!actions.length) return false
    const nodeActions = (opts.node ?? true) ? actions.filter((a) => !a.fn) : []
    const globalActions = (opts.global ?? true) ? actions.filter((a) => a.fn) : []
    const target = this.#getTarget()

    // Phase 1 - Node actions
    // A node's action targets have higher precedence than the node itself
    if (nodeActions.length) {
      for (const t of target ? [...target.actionTargets, target] : []) {
        for (const a of nodeActions)
          if (this.dispatch(a, { key: routed, source: "key", target: t })) return true
      }
    }

    // Phase 2 - global actions
    for (const a of globalActions) if (this.dispatch(a, { key: routed, source: "key" })) return true

    return false
  }

  /**
   * Build a `canonical-key → action-id[]` keymap from every catalog
   * entry's `keys` field. Multiple actions can share the same default
   * binding (e.g. both `input.submit` and `menu.select` default to
   * `enter`) — the router's dispatch tries each candidate in order
   * and the first whose handler is reachable on the focus chain
   * wins. Registration order defines priority; later wins.
   */
  #updateKeymap(): void {
    const out = new Map<KeyPattern, string[]>()
    for (const [id, info] of this.#catalog) {
      if (!info.keys) continue
      for (const pattern of info.keys) {
        const c = canonical(pattern)
        const list = out.get(c) ?? []
        list.push(id)
        out.set(c, list)
      }
    }
    this.#keymap = out
  }

  whichKey(node: Node, opts: { filter?: ActionFilter } = {}): (Action & { keys: string[] })[] {
    const ret: (Action & { keys: string[] })[] = []
    const actions = Object.keys(node.actions ?? {})
      .map((id) => this.get(id))
      .filter((a) => filterAction(a, opts.filter))
      .toSorted((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
    const used = new Set<string>()
    for (const action of actions) {
      const keys = (action.keys ?? []).map((k) => canonical(k)).filter((k) => !used.has(k))
      if (keys.length === 0) continue
      keys.forEach((k) => used.add(k))
      ret.push({ ...action, keys })
    }
    return ret
  }
}
