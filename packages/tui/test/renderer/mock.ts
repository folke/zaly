import type { MountCtx } from "../../src/core/ctx.ts"
import type { SurfaceType } from "../../src/renderer/index.ts"
import type { TerminalReader, TerminalWriter } from "../../src/renderer/terminal.ts"

import { Logger } from "@zaly/shared/logger"
import { afterEach } from "vitest"
import { Actions } from "../../src/input/actions.ts"
import { TerminalQueries } from "../../src/input/queries.ts"
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
  const logger = new Logger()
  actions.setTargetResolver(() => router.focused)
  router.setActions(actions)
  return {
    actions,
    logger,
    findNode: () => [],
    getNode: () => undefined,
    input: {
      get terminalFocus() {
        return router.terminalFocus
      },
      events: router,
      bind: (binding) => actions.bind(binding),
      blur: (n) => router.blur(n),
      queries: new TerminalQueries(router, { write: () => {} }),
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

/**
 * Register an `afterEach` that stops every tracked stoppable and clears the
 * set. Call once at a test file's top level, then pass anything with a
 * `stop()` (a `Terminal`, a `Renderer`, …) through the returned `track` fn so
 * started terminals don't leak their progress interval / resize listeners
 * across tests. Returns the value for inline use.
 */
export function autoStop(): <T extends { stop: () => void }>(v: T) => T {
  const items = new Set<{ stop: () => void }>()
  afterEach(() => {
    for (const item of items) item.stop()
    items.clear()
  })
  return (v) => {
    items.add(v)
    return v
  }
}
