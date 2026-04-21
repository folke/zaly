import type { Node } from "../core/node.ts"
import type { Renderer } from "../renderer/index.ts"
import type { Input } from "../widgets/input.ts"
import type { Menu } from "../widgets/menu.ts"
import type { KeyPattern } from "./keys.ts"
import type { RoutedKey } from "./router.ts"

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
  fn?: (ctx: ActionCtx) => void
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
export type NodeAction = ((ctx: ActionCtx) => void) | (ActionInfo & { fn: (ctx: ActionCtx) => void })

/** Shape of a Node's `actions` dict — full action ids as keys. */
export type ActionMap = Record<string, NodeAction>

// export type Actions<T extends string = string> = Record<T, ActionInfo>

/**
 * Union of every built-in action id. Derived from widget `actions`
 * dicts plus the Renderer's `globalActions`. Used to constrain the
 * `defaultActions` catalog so TypeScript catches missing docs or
 * renamed actions at compile time.
 */
export type BuiltinAction = keyof (Input["actions"] & Menu["actions"] & Renderer["globalActions"])

/**
 * Catalog of built-in actions with descriptions and default bindings.
 * Typed as `Record<BuiltinAction, ActionInfo>` so missing entries are a
 * compile error — add an action to a widget and you'll be nudged to
 * document it here.
 *
 * The Renderer registers this into its `actions` registry at
 * construction; apps compose further catalogs via
 * `renderer.actions.register(...)`.
 */
export const defaultActions: Record<BuiltinAction, ActionInfo> = {
  "global.quit": {
    desc: "quit",
    keys: ["ctrl-c"],
  },
  "input.cursorDown": {
    desc: "move cursor down one line",
    keys: ["down"],
  },
  "input.cursorLeft": {
    desc: "move cursor left",
    keys: ["left"],
  },
  "input.cursorLineEnd": {
    desc: "jump to end of current line",
    keys: ["end", "ctrl-e"],
  },
  "input.cursorLineStart": {
    desc: "jump to start of current line",
    keys: ["home", "ctrl-a"],
  },
  "input.cursorRight": {
    desc: "move cursor right",
    keys: ["right"],
  },
  "input.cursorUp": {
    desc: "move cursor up one line",
    keys: ["up"],
  },
  "input.deleteCharBack": {
    desc: "delete the character before the cursor",
    keys: ["backspace"],
  },
  "input.deleteCharForward": {
    desc: "delete the character at the cursor",
    keys: ["delete"],
  },
  "input.deleteWordBack": {
    desc: "delete the word before the cursor",
    keys: ["ctrl-w"],
  },
  "input.insertNewline": {
    desc: "insert a newline at the cursor (copies leading indent)",
    keys: ["shift-enter", "alt-enter"],
  },
  "input.insertTab": {
    desc: "insert an indent (two spaces) at the cursor",
    keys: ["tab"],
  },
  "input.submit": {
    desc: "submit the current value",
    keys: ["enter"],
  },
  "menu.cancel": {
    desc: "cancel the menu",
    keys: ["esc"],
  },
  "menu.first": {
    desc: "jump to the first item",
    keys: ["home"],
  },
  "menu.last": {
    desc: "jump to the last item",
    keys: ["end"],
  },
  "menu.next": {
    desc: "move to the next item",
    keys: ["down", "ctrl-n"],
  },
  "menu.prev": {
    desc: "move to the previous item",
    keys: ["up", "ctrl-p"],
  },
  "menu.select": {
    desc: "select the active item",
    keys: ["enter", "tab"],
  },
}

/** Emitted by `Actions` whenever the catalog changes (register /
 *  unregister). The Router listens to rebuild its keymap index. */
export type ActionsListener = () => void

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
export class Actions {
  readonly #catalog = new Map<string, ActionInfo>()
  readonly #listeners = new Set<ActionsListener>()
  /** Optional focus-chain walker. Supplied by the Renderer so Actions
   *  doesn't have to know about the router directly. Returns the
   *  starting node (focused by default) so dispatch can walk up. */
  #getTarget: () => Node | undefined = () => undefined

  /** Internal — the Renderer wires this after construction. */
  setTargetResolver(fn: () => Node | undefined): void {
    this.#getTarget = fn
  }

  /** Subscribe to catalog changes. Returns an unsubscribe. */
  onChange(fn: ActionsListener): () => void {
    this.#listeners.add(fn)
    return () => {
      this.#listeners.delete(fn)
    }
  }

  /**
   * Register or merge catalog entries. Values are shallow-merged into
   * existing entries by id.
   *
   * - `extend: true` (default) — new values **override** existing
   *   fields. Use this for app/user rebinds where you *want* to
   *   overwrite defaults.
   * - `extend: false` — existing values **win**. Use this for widget-
   *   level contributions (e.g. a plugin mounting for the first time)
   *   so defaults don't clobber whatever the user already configured.
   *
   * Returns an unregister function that rolls this call back.
   */
  register(
    entries: Record<string, ActionInfo>,
    opts: { extend?: boolean } = {},
  ): () => void {
    const extend = opts.extend ?? true
    const ids = Object.keys(entries)
    const prior = new Map<string, ActionInfo | undefined>()
    for (const id of ids) prior.set(id, this.#catalog.get(id))
    for (const [id, info] of Object.entries(entries)) {
      const existing = this.#catalog.get(id)
      this.#catalog.set(id, extend ? { ...existing, ...info } : { ...info, ...existing })
    }
    this.#emitChange()
    return () => {
      for (const id of ids) {
        const before = prior.get(id)
        if (before === undefined) this.#catalog.delete(id)
        else this.#catalog.set(id, before)
      }
      this.#emitChange()
    }
  }

  /** Remove entries by id. */
  unregister(...ids: string[]): void {
    let changed = false
    for (const id of ids) {
      if (this.#catalog.delete(id)) changed = true
    }
    if (changed) this.#emitChange()
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
      info.fn({ id, source, target, ...partial })
      return true
    }
    for (let node: Node | undefined = target; node !== undefined; node = node.parent) {
      const entry = node.actions?.[id]
      const fn = typeof entry === "function" ? entry : entry?.fn
      if (typeof fn === "function") {
        fn({ id, node, source, target, ...partial })
        return true
      }
    }
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
  buildKeymap(): Map<string, string[]> {
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
    return out
  }

  #emitChange(): void {
    for (const fn of this.#listeners) fn()
  }
}
