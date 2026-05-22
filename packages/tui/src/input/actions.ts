import type { Node } from "../core/node.ts"
import type { Renderer } from "../renderer/renderer.ts"
import type { Input } from "../widgets/input.ts"
import type { Menu } from "../widgets/menu.ts"
import type { KeyPattern } from "./keys.ts"
import type { KeyPatterns, RoutedKey } from "./router.ts"

import { Emitter } from "@zaly/shared"
import { Logger } from "@zaly/shared/logger"
import { canonical } from "./keys.ts"

/**
 * Context handed to every action handler. Whether the action was
 * fired by a key, programmatic dispatch, command palette, or a plugin,
 * handlers see a uniform payload.
 */
export interface ActionCtx {
  /** The action id being dispatched. */
  readonly id: string
  /** The node whose `actions[id]` handler matched, or `undefined` when
   *  the action was handled by a catalog-level `fn` (not tied to a
   *  specific node). */
  readonly node?: Node
  /** The node dispatch started from — typically the focused node for
   *  key- or palette-triggered actions. `undefined` for purely
   *  programmatic dispatch with no anchor. */
  readonly target?: Node
  /** What triggered the dispatch. Open string for extensibility. */
  readonly source: "key" | "programmatic" | (string & {})
  /** When `source === "key"`, the originating routed key event. */
  readonly key?: RoutedKey
}

export type ActionFn = (ctx: ActionCtx) => unknown

export type KeyBinding = Omit<ActionInfo, "fn" | "keys"> & {
  id: string
  fn: ActionFn
  keys: KeyPatterns
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
export interface ActionInfo {
  name?: string
  desc?: string
  keys?: readonly KeyPattern[]
  hidden?: boolean
  fn?: ActionFn
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
export type NodeAction =
  | ((ctx: ActionCtx) => void)
  | (ActionInfo & { fn: (ctx: ActionCtx) => void })

/** Shape of a Node's `actions` dict — full action ids as keys. */
export type ActionMap = Record<string, NodeAction>

/**
 * Union of every built-in action id. Derived from widget `actions`
 * dicts plus the Renderer's `globalActions`. Used to constrain the
 * `defaultActions` catalog so TypeScript catches missing docs or
 * renamed actions at compile time.
 */
export type BuiltinAction = keyof (Input["actions"] & Menu["actions"] & Renderer["globalActions"])

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
  readonly #catalog = new Map<string, ActionInfo>()
  /** Optional focus-chain walker. Supplied by the Renderer so Actions
   *  doesn't have to know about the router directly. Returns the
   *  starting node (focused by default) so dispatch can walk up. */
  #getTarget: () => Node | undefined = () => undefined
  #logger: Logger
  #keymap = new Map<string, string[]>()

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
        keys: Array.isArray(keys) ? keys : [keys],
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
  register(entries: Record<string, ActionInfo>, opts: { default?: boolean } = {}): () => void {
    const isDefault = opts.default ?? false
    const ids = Object.keys(entries)
    const prior = new Map<string, ActionInfo | undefined>()
    for (const id of ids) prior.set(id, this.#catalog.get(id))
    for (const [id, info] of Object.entries(entries)) {
      const existing = this.#catalog.get(id)
      this.#catalog.set(id, isDefault ? { ...info, ...existing } : { ...existing, ...info })
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
  unregister(...ids: string[]): void {
    let changed = false
    for (const id of ids) {
      if (this.#catalog.delete(id)) changed = true
    }
    if (changed) void this.emit("change")
  }

  get(id: string): ActionInfo | undefined {
    return this.#catalog.get(id)
  }

  /** All catalog entries, in insertion order. */
  list(): (readonly [id: string, info: ActionInfo])[] {
    return [...this.#catalog.entries()]
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
  dispatch(id: string, partial: Partial<ActionCtx> = {}): boolean {
    const info = this.#catalog.get(id)
    const target = partial.target ?? this.#getTarget()
    const source = partial.source ?? "programmatic"
    if (info?.fn) {
      const ctx = { id, source, target, ...partial }
      const fn = info.fn
      this.#logger.try(() => fn(ctx), { id, name: "dispatch", source })
      return true
    }
    for (let node: Node | undefined = target; node !== undefined; node = node.parent) {
      if (!node.visible || !node.mounted) continue
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

  dispatchKey(routed: RoutedKey): boolean {
    const entries = this.#keymap.get(routed.pattern) ?? []
    const nodeActions = entries.filter((id) => !this.get(id)?.fn)
    const globalActions = entries.filter((id) => this.get(id)?.fn)
    const target = this.#getTarget()

    // Phase 1 - Node actions
    // A node's action targets have higher precedence than the node itself
    for (const t of target ? [...target.actionTargets, target] : []) {
      for (const a of nodeActions)
        if (this.dispatch(a, { key: routed, source: "key", target: t })) return true
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
    const out = new Map<string, string[]>()
    for (const [id, info] of this.#catalog) {
      if (!info.keys) continue
      for (const pattern of info.keys) {
        const c = canonical(pattern as string)
        const list = out.get(c) ?? []
        list.push(id)
        out.set(c, list)
      }
    }
    this.#keymap = out
  }
}
