import type { TerminalReader, TerminalWriter } from "../../src/renderer/terminal.ts"

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
