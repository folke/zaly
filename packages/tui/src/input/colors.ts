import type { TerminalPaletteSnapshot, TerminalQueries } from "./queries.ts"
import type { InputRouter } from "./router.ts"

/** One renderer run: coalesce updates, discard stale snapshots, and own cleanup. */
export class ColorsWatcher {
  readonly #ac = new AbortController()
  #appearance: "dark" | "light" | undefined
  #revision = 0
  #pending = false
  #running = false
  #previous = ""

  constructor(
    readonly queries: TerminalQueries,
    readonly input: InputRouter,
    readonly write: (sequence: string) => void,
    readonly update: (
      snapshot: TerminalPaletteSnapshot,
      appearance: "dark" | "light" | undefined
    ) => void
  ) {
    input.on(
      "term-response",
      ({ event }) => {
        if (event.kind !== "csi" || event.final !== "n" || !/^\?997(?:;[012])?$/.test(event.params))
          return
        if (event.params === "?997") this.#queryAppearance()
        if (event.params === "?997;1") this.#appearance = "dark"
        if (event.params === "?997;2") this.#appearance = "light"
        this.refresh()
      },
      { signal: this.#ac.signal }
    )
    input.on(
      "terminal-focus",
      ({ gained }) => {
        if (!gained) return
        this.#queryAppearance()
        this.refresh()
      },
      { signal: this.#ac.signal }
    )
    write("\x1b[?2031h")
    this.#queryAppearance()
    this.refresh()
  }

  #queryAppearance() {
    void this.queries.colorScheme({ signal: this.#ac.signal })
  }

  refresh(): void {
    if (this.#ac.signal.aborted) return
    this.#revision++
    this.#pending = true
    if (!this.#running) void this.#refresh()
  }

  async #refresh() {
    this.#running = true
    try {
      while (this.#pending && !this.#ac.signal.aborted) {
        this.#pending = false
        const revision = this.#revision
        // oxlint-disable-next-line no-await-in-loop -- OSC replies are untagged; snapshots must not overlap.
        const snapshot = await this.queries.palette({ signal: this.#ac.signal })
        if (revision !== this.#revision) continue
        const key = JSON.stringify([snapshot, this.#appearance])
        if (key === this.#previous) continue
        this.#previous = key
        this.update(snapshot, this.#appearance)
      }
    } finally {
      this.#running = false
    }
  }

  stop(): void {
    if (this.#ac.signal.aborted) return
    this.#revision++
    this.#ac.abort()
    this.write("\x1b[?2031l")
  }
}
