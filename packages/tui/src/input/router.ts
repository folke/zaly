import type { Node } from "../core/node.ts"
import type { InputEvent } from "./decoder.ts"
import type { ActionFn, ActionMap } from "./keymap.ts"
import type { KeyEvent, KeyPattern } from "./keys.ts"

import { canonical, keyMatches } from "./keys.ts"

export type { KeyPattern }
export type KeyPatterns = KeyPattern | readonly KeyPattern[]
export type KeyHandler = (ev: KeyEvent) => boolean | void

interface KeyBinding {
  pattern: KeyPatterns
  handler: KeyHandler
}

interface IndexedHit {
  scope: string
  action: string
}

/**
 * A routed keyboard event — the raw `KeyEvent` data plus a propagation
 * control. Listeners call `.stop()` to consume the event; the router
 * checks `.stopped` between parent-chain hops and halts bubbling.
 */
export interface RoutedKey {
  name: string
  text?: string
  ctrl: boolean
  alt: boolean
  shift: boolean
  meta: boolean
  stopped: boolean
  stop(): void
}

/** A routed paste event — the pasted text + the same propagation control. */
export interface RoutedPaste {
  text: string
  stopped: boolean
  stop(): void
}

/**
 * Routes decoder events to the right node and/or registered action.
 *
 * Dispatch priority for a key event:
 *
 *   1. **`bind`** handlers (pattern → callback). Direct, no scope;
 *      a handler that returns `true` consumes the event. Kept as a
 *      shortcut for bindings that aren't worth a named-action entry
 *      (simple throwaway scripts, tests).
 *   2. **Named actions via the keymap.** The router canonicalises the
 *      event, looks up `{ scope, action }` hits in the pre-built index,
 *      and for each hit walks the focused node's parent chain looking
 *      for a node whose `id` or `type` matches the scope. On a match,
 *      tries `node.actions[action]` first (widget-internal, parameterless)
 *      and falls back to `externalActions[scope][action](node)`
 *      (plugin-contributed).
 *   3. **Raw `key` / `paste` events** bubble through `node.emit("key", …)`
 *      up the parent chain — where widgets handle unbound keystrokes
 *      (printable-char insertion, etc.).
 *
 * Global bindings are just scoped actions with scope `"global"`. The
 * UI surface tags its root node with `id = "global"`, so the scope-
 * chain walk naturally reaches it for any focused widget parented to
 * the UI tree — no special-case path in the router.
 *
 * Paste and focus events follow the simple emit-and-bubble path; only
 * key events go through the action pipeline.
 */
export class InputRouter {
  readonly #globals: KeyBinding[] = []
  readonly #externalActions = new Map<string, Map<string, ActionFn>>()
  readonly #index = new Map<string, IndexedHit[]>()
  #focused: Node | undefined

  /** Currently-focused node, or `undefined` when none. */
  get focused(): Node | undefined {
    return this.#focused
  }

  /**
   * Move focus to `node` (or clear it with `undefined`). Emits `blur`
   * on the previously-focused node and `focus` on the new one.
   * Focusing the already-focused node is a no-op.
   */
  focus(node: Node | undefined): void {
    if (this.#focused === node) return
    const prev = this.#focused
    this.#focused = node
    if (prev !== undefined) prev.emit("blur")
    if (node !== undefined) node.emit("focus")
  }

  /**
   * Register a direct global key binding. Fires before named-action
   * dispatch; a handler that returns `true` consumes the event. Returns
   * an unsubscribe function.
   *
   * Use this for one-off bindings where rolling a named-action catalog
   * is overkill — ctrl-c → quit in a demo, for example. For
   * user-configurable bindings prefer `setKeymaps` + action defs.
   */
  bind(pattern: KeyPatterns, handler: KeyHandler): () => void {
    const binding: KeyBinding = { handler, pattern }
    this.#globals.push(binding)
    return () => {
      const i = this.#globals.indexOf(binding)
      if (i !== -1) this.#globals.splice(i, 1)
    }
  }

  /**
   * Install a keymap — a flat record of dotted scope.action keys to key
   * patterns. Rebuilds the router's internal pattern index. Safe to
   * call repeatedly (e.g. on config hot-reload).
   *
   * ```ts
   * router.setKeymaps({
   *   "input.cursorLeft": ["left"],
   *   "input.submit":     ["enter"],
   *   "global.quit":      ["ctrl-c"],
   * })
   * ```
   */
  setKeymaps(keymaps: Record<string, readonly KeyPattern[]>): void {
    this.#index.clear()
    for (const [dotted, patterns] of Object.entries(keymaps)) {
      const dot = dotted.indexOf(".")
      if (dot <= 0) continue // malformed, skip silently
      const scope = dotted.slice(0, dot)
      const action = dotted.slice(dot + 1)
      for (const p of patterns) {
        const key = canonical(p as string)
        const list = this.#index.get(key) ?? []
        list.push({ action, scope })
        this.#index.set(key, list)
      }
    }
  }

  /**
   * Register external actions for a scope. Keys are action names
   * (without the `"<scope>."` prefix). Each handler receives the node
   * whose `id` / `type` matched the scope at dispatch time — useful for
   * plugin actions that operate on a widget instance but aren't defined
   * on the widget class.
   *
   * ```ts
   * router.registerActions("editor", {
   *   toggleThinking: () => { appState.thinking = !appState.thinking },
   *   deleteLine: (editor: Input) => { … },
   * })
   * ```
   */
  registerActions<N extends Node>(scope: string, actions: ActionMap<N>): void {
    const map = this.#externalActions.get(scope) ?? new Map<string, ActionFn>()
    for (const [name, fn] of Object.entries(actions)) {
      map.set(name, fn as ActionFn)
    }
    this.#externalActions.set(scope, map)
  }

  /**
   * Dispatch a decoder event. Returns `true` if the event was consumed
   * (by a global, a named action, or a node's `stop()`), `false` if it
   * reached the root unclaimed.
   */
  dispatch(ev: InputEvent): boolean {
    // Terminal-level focus reporting is informational for now — widgets
    // can subscribe directly via the router later if we want. It isn't
    // bubbled to nodes (there's no single "terminal got focus" node).
    if (ev.type === "key") return this.#dispatchKey(ev.event)
    if (ev.type === "paste") return this.#dispatchPaste(ev.text)
    return false
  }

  #dispatchKey(event: KeyEvent): boolean {
    // 1. Direct `bind()` handlers.
    for (const g of this.#globals) {
      if (keyMatches(event, g.pattern) && g.handler(event) === true) return true
    }

    // 2. Named actions via the scoped index. Walk the focused node's
    //    parent chain; for each node, try `id` bindings first (most
    //    specific), then `type`. Within a scope match, internal actions
    //    on the node take precedence over external plugin-registered
    //    ones. Global bindings are reached naturally — the UI root has
    //    `id = "global"` and sits at the top of the focus chain.
    const hits = this.#index.get(canonical(event)) ?? []
    if (hits.length > 0) {
      for (let node: Node | undefined = this.#focused; node !== undefined; node = node.parent) {
        for (const scope of this.#scopesOf(node)) {
          for (const hit of hits) {
            if (hit.scope !== scope) continue
            const internal = (
              node.actions as Record<string, (() => void) | undefined> | undefined
            )?.[hit.action]
            if (typeof internal === "function") {
              internal()
              return true
            }
            const external = this.#externalActions.get(scope)?.get(hit.action)
            if (typeof external === "function") {
              external(node)
              return true
            }
          }
        }
      }
    }

    // 3. Raw key bubble for widget fallback (printable-char insertion, etc.).
    const routed = makeRoutedKey(event)
    return this.#bubble(routed, "key")
  }

  #dispatchPaste(text: string): boolean {
    const routed = makeRoutedPaste(text)
    return this.#bubble(routed, "paste")
  }

  #bubble(routed: RoutedKey | RoutedPaste, kind: "key" | "paste"): boolean {
    let node = this.#focused
    while (node !== undefined) {
      if (kind === "key") node.emit("key", routed as RoutedKey)
      else node.emit("paste", routed as RoutedPaste)
      if (routed.stopped) return true
      node = node.parent
    }
    return false
  }

  #scopesOf(node: Node): string[] {
    const scopes: string[] = []
    const nodeId = node.id()
    if (nodeId !== undefined) scopes.push(nodeId)
    if (node.type !== undefined) scopes.push(node.type)
    return scopes
  }
}

function makeRoutedKey(ev: KeyEvent): RoutedKey {
  const r: RoutedKey = {
    alt: ev.alt,
    ctrl: ev.ctrl,
    meta: ev.meta,
    name: ev.name,
    shift: ev.shift,
    stop: () => {
      r.stopped = true
    },
    stopped: false,
  }
  if (ev.text !== undefined) r.text = ev.text
  return r
}

function makeRoutedPaste(text: string): RoutedPaste {
  const r: RoutedPaste = {
    stop: () => {
      r.stopped = true
    },
    stopped: false,
    text,
  }
  return r
}
