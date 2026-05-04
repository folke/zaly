import type { SessionStore } from "./store.ts"
import type { SessionNode } from "./types.ts"

/**
 * In-memory `SessionStore` — a `Map<uuid, SessionNode>` plus a `root`
 * pointer. No persistence. Construction takes optional initial nodes
 * for tests, replay tools, and the Claude session importer.
 */
export class MemoryStore implements SessionStore {
  readonly #nodes: Map<string, SessionNode>
  #root?: SessionNode

  constructor(nodes?: Iterable<SessionNode>) {
    this.#nodes = new Map()
    if (nodes) {
      for (const node of nodes) {
        this.#nodes.set(node.uuid, node)
        this.#root = node
      }
    }
  }

  get root(): SessionNode | undefined {
    return this.#root
  }

async get(id: string): Promise<SessionNode | undefined> {
    return this.#nodes.get(id)
  }

async write(node: SessionNode): Promise<void> {
    this.#nodes.set(node.uuid, node)
    this.#root = node
  }

  *all(): Iterable<SessionNode> {
    yield* this.#nodes.values()
  }
}
