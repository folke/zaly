import type { MountCtx } from "../../src/core/ctx.ts"
import type { SurfaceType } from "../../src/renderer/index.ts"
import type { TerminalReader, TerminalWriter } from "../../src/renderer/terminal.ts"

import { Actions } from "../../src/input/actions.ts"
import { InputRouter } from "../../src/input/router.ts"

/**
 * Minimal MountCtx for tests that exercise Node / surface lifecycle in
 * isolation (no Renderer). Overlay/find are no-ops; a fresh `Actions`
 * + `InputRouter` are wired so `node.focus()` and `ctx.actions.*`
 * work as they would under a live Renderer.
 */
export function mockMountCtx(
  surface: SurfaceType = "stream",
  overrides?: Partial<MountCtx>
): MountCtx {
  const router = new InputRouter()
  const actions = new Actions()
  actions.setTargetResolver(() => router.focused)
  router.setActions(actions)
  return {
    onError: (_error) => {},
    actions,
    findNode: () => [],
    getNode: () => undefined,
    input: {
      bind: (pattern, handler) => router.bind(pattern, handler),
      blur: () => router.focus(undefined),
      focus: (node) => router.focus(node),
    },
    overlay: {
      add: () => {},
      remove: () => {},
    },
    surface,
    ...overrides,
  }
}

/**
 * Headless stdout stand-in: captures every `write(s)` into `log`, and
 * exposes a mutable `rows`/`columns` so tests can simulate a resize.
 * No real I/O.
 */
export class MockWriter implements TerminalWriter {
  readonly log: string[] = []
  columns: number
  rows: number
  readonly isTTY = true

  constructor(columns = 80, rows = 24) {
    this.columns = columns
    this.rows = rows
  }

  write(s: string): boolean {
    this.log.push(s)
    return true
  }

  /** Convenience: all written bytes concatenated. */
  get all(): string {
    return this.log.join("")
  }

  /** Clear captured output — useful between phases of a test. */
  clear(): void {
    this.log.length = 0
  }
}

/** Minimal stdin stub; no raw-mode hooks get wired. */
export class MockReader implements TerminalReader {
  readonly isTTY = false
  on(): void {}
  off(): void {}
}
