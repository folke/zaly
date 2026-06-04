import type { FileHandle } from "node:fs/promises"
import type { SessionStore } from "./store.ts"
import type { SessionNode } from "./types.ts"

import { normPath, safeStringify, withLock } from "@zaly/shared"
import { appendFile, open } from "node:fs/promises"

const CHUNK_SIZE = 4 * 1024 * 1024

/**
 * JSONL-backed `SessionStore` — append-only file, one record per line.
 *
 * Current implementation reads the entire file on `load()` and keeps the
 * full DAG in memory. Future optimizations (lazy reads with offset
 * index, LRU cache for huge sessions) can land behind this same
 * interface without changing `Session`.
 *
 * Crash tolerance: a truncated last line (interrupted mid-write) is
 * silently dropped; any other JSON parse error mid-file throws so real
 * corruption surfaces loudly.
 */
export class JsonlStore implements SessionStore {
  readonly path: string
  #nodes = new Map<string, SessionNode>()
  #root?: SessionNode
  #jsonl: JsonlReader<SessionNode>

  constructor(path: string) {
    this.path = path
    this.#jsonl = new JsonlReader(path)
  }

  /** Load + open: hydrate the DAG from `path` (when the file exists),
   *  then open the writer in append mode. New nodes land on disk as
   *  they're committed. */
  static async load(path: string): Promise<JsonlStore> {
    path = normPath(path)
    const ret = new JsonlStore(path)
    await ret.#fetch({ limit: 1 })
    return ret
  }

  async #fetch(opts?: { id?: string; limit?: number }): Promise<SessionNode | undefined> {
    let count = 0
    let value: SessionNode | undefined
    // oxlint-disable-next-line no-await-in-loop
    while ((value = await this.#jsonl.next()) !== undefined) {
      this.#nodes.set(value.uuid, value)
      this.#root ??= value
      if (opts?.limit && count++ >= opts.limit) break // safe — doesn't call .return()
      if (opts?.id && value.uuid === opts.id) return value
    }
  }

  get root(): SessionNode | undefined {
    return this.#root
  }

  async get(id: string): Promise<SessionNode | undefined> {
    return this.#nodes.get(id) ?? (await this.#fetch({ id }))
  }

  async write(node: SessionNode): Promise<void> {
    const line = `${safeStringify(node)}\n`
    await withLock(this.path, async () => {
      await appendFile(this.path, line, "utf8")
    })
    this.#nodes.set(node.uuid, node)
    this.#root = node
  }

  async close(): Promise<void> {
    await this.#jsonl.close()
  }

  async *all(): AsyncIterable<SessionNode> {
    await this.#fetch()
    yield* this.#nodes.values()
  }
}

export class JsonlReader<T> {
  #fd?: FileHandle
  #path: string
  #it?: AsyncIterableIterator<T>
  #count = 0

  constructor(readonly path: string) {
    this.#path = path
    this.#it = this.generator()
  }

  #toJson(line: string): T | undefined {
    if (line.trim() === "") return
    try {
      const ret = JSON.parse(line) as T
      this.#count++
      return ret
    } catch (error) {
      // Tolerate a truncated last line (crash mid-write); anything
      // else is real corruption.
      if (this.#count === 0) return
      throw new Error(
        `JsonlStore.load: malformed JSON at line ${this.#count + 1} of "${this.#path}": ${(error as Error).message}`,
        { cause: error }
      )
    }
  }

  private async *generator(): AsyncIterableIterator<T> {
    try {
      this.#fd = await open(this.#path, "r")
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return
      throw error
    }
    let { size: position } = await this.#fd.stat()
    let leftover = ""
    try {
      while (position > 0) {
        const length = Math.min(position, CHUNK_SIZE)
        position -= length
        // oxlint-disable-next-line no-await-in-loop
        const { buffer } = await this.#fd.read(Buffer.alloc(length), 0, length, position)
        const lines = (buffer.toString("utf8") + leftover).split(/\r?\n/)
        leftover = lines.shift() ?? ""
        for (let i = lines.length - 1; i >= 0; i--) {
          const v = this.#toJson(lines[i])
          if (v) yield v
        }
      }
      if (leftover.length) {
        const v = this.#toJson(leftover)
        if (v) yield v
      }
    } finally {
      await this.#fd.close()
      this.#it = undefined
    }
  }

  async next(): Promise<T | undefined> {
    if (!this.#it) return
    const { value, done } = await this.#it.next()
    return done ? undefined : value
  }

  async close() {
    if (this.#it) {
      await this.#it.return?.() // runs the generator's finally
      this.#it = undefined
    }
  }
}
