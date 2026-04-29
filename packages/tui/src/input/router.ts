import type { Node } from "../core/node.ts"
import type { Actions } from "./actions.ts"
import type { InputEvent } from "./decoder.ts"
import type { KeyEvent, KeyPattern } from "./keys.ts"

import { canonical, keyMatches } from "./keys.ts"

export type { KeyPattern }
export type KeyPatterns = KeyPattern | readonly KeyPattern[]
export type KeyHandler = (ev: KeyEvent) => boolean | void

/** A keymap entry is either an action id (string) or a direct key
 *  handler — the Router treats them as alternate branches on match.
 *  Multiple entries can share the same key; dispatch tries each in
 *  order until one consumes. */
export type KeymapEntry = string | KeyHandler

interface KeyBinding {
  pattern: KeyPatterns
  handler: KeyHandler
}

/**
 * A routed keyboard event — the raw `KeyEvent` data plus a propagation
 * control and a precomputed canonical `pattern`. Listeners call
 * `.stop()` to consume the event; the router checks `.stopped` between
 * parent-chain hops and halts bubbling.
 */
export interface RoutedKey {
  name: string
  text?: string
  ctrl: boolean
  alt: boolean
  shift: boolean
  meta: boolean
  /** Canonical pattern form (e.g. `"ctrl-a"`, `"shift-enter"`). Handy
   *  for `switch(ev.pattern)` matching without calling `keyMatches`. */
  pattern: string
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
 * Routes decoder events to the right node and/or action.
 *
 * Dispatch priority for a key event (most-specific-first):
 *
 *   1. **Per-node `"key"` bubble** — focused node up to root. Each
 *      node's `on("key")` / `bind()` handlers fire. Calling `.stop()`
 *      ends dispatch. This is where local overrides live.
 *   2. **Keymap lookup** — a single table built by the `Actions`
 *      registry (`canonical pattern → action id | direct handler`).
 *      Action ids are dispatched through `Actions.dispatch(id)`,
 *      which walks the focus chain for `node.actions[id]` — or
 *      calls a catalog-level `fn` if the action has one.
 *   3. **Global `bind()` handlers** — a last-resort fallback for
 *      ad-hoc app-level bindings registered via `router.bind(...)`.
 *
 * Paste events follow a simple emit-and-bubble path — no keymap.
 */
export class InputRouter {
  readonly #globals: KeyBinding[] = []
  #keymap = new Map<string, KeymapEntry[]>()
  #focused: Node | undefined
  /** Set by the Renderer so keymap-matched action ids can be
   *  dispatched through the catalog. */
  #actions: Actions | undefined

  /** Internal — wired by the Renderer at construction. */
  setActions(actions: Actions): void {
    this.#actions = actions
  }

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
   * Register a direct global key binding. Fires as the last dispatch
   * phase — after node handlers and keymap lookup — so it's a proper
   * fallback rather than a pre-empt. A handler that returns `true`
   * consumes the event. Returns an unsubscribe.
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
   * Install a keymap. Each entry maps a key pattern to either an
   * action id (string, dispatched through the `Actions` registry) or
   * a direct handler. Replaces the previous keymap wholesale.
   *
   * ```ts
   * router.setKeymap({
   *   left:     "input.cursorLeft",
   *   "ctrl-s": () => save(),
   *   "ctrl-c": "global.quit",
   * })
   * ```
   */
  setKeymap(keymap: Record<string, KeymapEntry | readonly KeymapEntry[]>): void {
    const next = new Map<string, KeymapEntry[]>()
    for (const [pattern, entry] of Object.entries(keymap)) {
      const c = canonical(pattern)
      const list = Array.isArray(entry) ? [...entry] : [entry as KeymapEntry]
      next.set(c, list)
    }
    this.#keymap = next
  }

  /** Replace the index-level map directly. Used by the Actions
   *  registry via `onChange` to rebuild the index when the catalog
   *  changes without going through the public string form. */
  setKeymapIndex(map: Map<string, KeymapEntry[]>): void {
    this.#keymap = map
  }

  /**
   * Dispatch a decoder event. Returns `true` if consumed.
   */
  dispatch(ev: InputEvent): boolean {
    if (ev.type === "key") return this.#dispatchKey(ev.event)
    if (ev.type === "paste") return this.#dispatchPaste(ev.text)
    return false
  }

  #dispatchKey(event: KeyEvent): boolean {
    // Phase 1 — per-node key bubble. Most-local wins.
    const routed = makeRoutedKey(event)
    for (let node: Node | undefined = this.#focused; node !== undefined; node = node.parent) {
      node.emit("key", { key: routed })
      if (routed.stopped) return true
    }

    // Phase 2 — keymap lookup. Each pattern can resolve to a list of
    // candidates (direct handlers or action ids); dispatch tries each
    // in order, first one that consumes wins. That's how `enter`
    // reaches both `input.submit` and `menu.select` without one
    // permanently shadowing the other — the Input is on the focus
    // chain for one, a mounted Menu for the other.
    const entries = this.#keymap.get(routed.pattern)
    if (entries !== undefined) {
      for (const entry of entries) {
        if (typeof entry === "function") {
          if (entry(event) === true) return true
        } else if (this.#actions !== undefined) {
          if (this.#actions.dispatch(entry, { key: routed, source: "key" })) return true
        }
      }
    }

    // Phase 3 — global fallback. Last-resort app/demo bindings.
    for (const g of this.#globals) {
      if (keyMatches(event, g.pattern) && g.handler(event) === true) return true
    }
    return false
  }

  #dispatchPaste(text: string): boolean {
    const routed = makeRoutedPaste(text)
    let node = this.#focused
    while (node !== undefined) {
      node.emit("paste", { paste: routed })
      if (routed.stopped) return true
      node = node.parent
    }
    return false
  }
}

function makeRoutedKey(ev: KeyEvent): RoutedKey {
  const r: RoutedKey = {
    alt: ev.alt,
    ctrl: ev.ctrl,
    meta: ev.meta,
    name: ev.name,
    pattern: canonical(ev),
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
