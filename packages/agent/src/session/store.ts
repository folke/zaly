import type { SessionNode } from "./types.ts"

/**
 * Storage backend for a `Session`'s DAG.
 *
 * The store is the source of truth for nodes. `Session` reads through
 * the store for chain walks, and writes new nodes via `write()`.
 *
 * Implementations:
 *   - `MemoryStore` — `Map<uuid, SessionNode>`, no persistence. Used
 *     by tests and ephemeral / in-process sessions.
 *   - `JsonlStore` — append-only JSONL file. Eager-loads all records on
 *     `load()`; future versions may add lazy reads + LRU caching.
 *
 * Async by design — even `get()` may involve I/O for backends that don't
 * cache the full DAG in memory. Callers that need synchronous reads
 * should pre-warm via `Session`'s chain walk (which populates Session's
 * own caches as it goes).
 *
 * `root` is the most recently appended node. Loading a store sets `root`
 * from the last persisted record. Writes advance `root` synchronously
 * (the in-memory state must reflect the append before `write()` resolves)
 * so subsequent `root` reads see the new node — even if the underlying
 * I/O completes asynchronously.
 */
export interface SessionStore {
  /** The most recently appended node — drives chain walks. Undefined
   *  for an empty store. */
  readonly root: SessionNode | undefined

  /** Lookup by uuid. Returns undefined for unknown ids. */
  get(id: string): Promise<SessionNode | undefined>

  /** Append a node. Becomes the new `root`. The in-memory state must
   *  reflect the append synchronously (so a follow-up `root` read sees
   *  it) even when underlying I/O is still in flight. */
  write(node: SessionNode): Promise<void>

  /** Optional flush + cleanup hook — called by `Session.close()`. */
  close?(): Promise<void>

  /** Optional bulk iterator for the full DAG — used by `/tree` UI and
   *  the masker's full-history scans. Backends with lazy reads can
   *  override with a more efficient bulk-scan implementation. */
  all?(): Iterable<SessionNode> | AsyncIterable<SessionNode>
}
