import type { Node } from "../core/node.ts"
import type { Actions } from "./actions.ts"
import type { InputEvent, MouseEvent } from "./decoder.ts"
import type { KeyEvent, KeyPattern } from "./keys.ts"

import { Emitter } from "@zaly/shared"
import { Logger } from "@zaly/shared/logger"
import { canonical } from "./keys.ts"

export type KeyPatterns = KeyPattern | readonly KeyPattern[]
export type KeyHandler = (ev: KeyEvent) => boolean | void

/** A keymap entry is either an action id (string) or a direct key
 *  handler — the Router treats them as alternate branches on match.
 *  Multiple entries can share the same key; dispatch tries each in
 *  order until one consumes. */
export type KeymapEntry = string | KeyHandler

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
  stop: () => void
}

/** A routed paste event — the pasted text + the same propagation control. */
export interface RoutedPaste {
  text: string
  stopped: boolean
  stop: () => void
}

export type InputRouterEvents = {
  "terminal-focus": { gained: boolean }
  key: { event: KeyEvent }
  mouse: { event: MouseEvent }
  focus: { node: Node }
  blur: { node: Node }
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
export class InputRouter extends Emitter<InputRouterEvents> {
  #focused: Node[] = []
  /** Set by the Renderer so keymap-matched action ids can be
   *  dispatched through the catalog. */
  #actions: Actions | undefined
  #logger: Logger
  #terminalFocus = true

  constructor(logger?: Logger) {
    super()
    this.#logger = logger ?? new Logger()
  }

  /** Internal — wired by the Renderer at construction. */
  setActions(actions: Actions): void {
    this.#actions = actions
  }

  /** Currently-focused node, or `undefined` when none. */
  get focused(): Node | undefined {
    this.#focused = this.#focused.filter((n) => n.mounted)
    return this.#focused.at(-1)
  }

  /**
   * Move focus to `node`. Emits `blur`
   * on the previously-focused node and `focus` on the new one.
   * Focusing the already-focused node is a no-op.
   */
  focus(node: Node): void {
    // If the node is already focused, or not mounted, do nothing
    if (!node.mounted || this.focused === node) return

    const prev = this.focused

    // Remove the node from the focus stack if it exists, then push it to the top
    this.#focused = this.#focused.filter((n) => n !== node)
    this.#focused.push(node)

    if (prev !== undefined) {
      void prev.emit("blur")
      void this.emit("blur", { node: prev })
    }

    void node.emit("focus")
    void this.emit("focus", { node })
  }

  /** Clear focus from `node`. Emits `blur` on the node and `focus`
   * on the next-most-recently-focused node, if any. */
  blur(node: Node): void {
    const top = this.focused

    // Remove the node from the focus stack if it exists
    this.#focused = this.#focused.filter((n) => n !== node)

    // If the node is not the currently focused node, do nothing
    if (top !== node) return

    const next = this.focused

    void node.emit("blur")
    void this.emit("blur", { node })

    if (next !== undefined) {
      void next.emit("focus")
      void this.emit("focus", { node: next })
    }
  }

  get terminalFocus(): boolean {
    return this.#terminalFocus
  }

  /**
   * Dispatch a decoder event. Returns `true` if consumed.
   */
  dispatch(ev: InputEvent): boolean {
    return this.#logger.try(() => this.#dispatch(ev), "dispatch") ?? false
  }

  #dispatch(ev: InputEvent): boolean {
    if (ev.type === "key") return this.#dispatchKey(ev.event)
    if (ev.type === "paste") return this.#dispatchPaste(ev.text)
    if (ev.type === "mouse") {
      void this.emit("mouse", { event: ev })
      return false
    } else {
      this.#terminalFocus = ev.gained
      void this.emit("terminal-focus", { gained: ev.gained })
    }
    return false
  }

  #dispatchKey(event: KeyEvent): boolean {
    void this.emit("key", { event })
    const routed = makeRoutedKey(event)

    // Phase 1 - node actions
    if (this.#actions?.dispatchKey(routed, { global: false, node: true })) return true

    // Phase 2 — per-node key bubble. Most-local wins.
    for (let node: Node | undefined = this.focused; node !== undefined; node = node.parent) {
      void node.emit("key", { key: routed })
      if (routed.stopped) return true
    }

    // Phase 3 - global actions
    return this.#actions?.dispatchKey(routed, { global: true, node: false }) ?? false
  }

  #dispatchPaste(text: string): boolean {
    const routed = makeRoutedPaste(text)
    let node = this.focused
    while (node !== undefined) {
      void node.emit("paste", { paste: routed })
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
