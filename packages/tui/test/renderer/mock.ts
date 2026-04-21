import type { MountCtx } from "../../src/core/ctx.ts"
import type { Surface } from "../../src/renderer/index.ts"
import type { TerminalReader, TerminalWriter } from "../../src/renderer/terminal.ts"

import { InputRouter } from "../../src/input/router.ts"

/**
 * Minimal MountCtx for tests that exercise Node / surface lifecycle in
 * isolation (no Renderer). Overlay/find/invalidate are no-ops; the
 * `router` is a fresh InputRouter so `node.focus()` works.
 */
export function mockMountCtx(
  surface: Surface = "stream",
  overrides?: Partial<MountCtx>,
): MountCtx {
  const router = new InputRouter()
  return {
    findNode: () => [],
    getNode: () => undefined,
    input: {
      bind: (pattern, handler) => router.bind(pattern, handler),
      blur: () => router.focus(undefined),
      focus: (node) => router.focus(node),
      registerActions: (scope, actions) => router.registerActions(scope, actions),
    },
    overlay: {
      close: () => {},
      open: () => {},
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
