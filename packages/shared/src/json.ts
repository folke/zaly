import type { PropPath, PropValue } from "./prop.ts"
import type { MaybePromise } from "./types.ts"

import { readFile, stat } from "node:fs/promises"
import { dirname } from "pathe"
import { normPath } from "./path.ts"
import { propGet, propSet } from "./prop.ts"
import { atomicWriteFile, safeStringify, withError, withLock } from "./utils.ts"

export type JsonObject = { [Key in string]: JsonValue }
export type JsonArray = JsonValue[] | readonly JsonValue[]
export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonObject | JsonArray

/** Reviver type for JSON.parse.
 *  - `this`: The value of the containing object at the time the reviver is called.
 *  - `key`: The key of the property being processed.
 *  - `value`: The value of the property being processed, after any transformations by previous reviver calls.
 *
 *  The reviver can return a transformed value to replace the original, or `undefined` to delete the property.
 * */
export type JsonReviver = (this: unknown, key: string, value: unknown) => unknown

export async function readJson<T extends JsonObject = JsonObject>(
  path: string,
  reviver?: JsonReviver
): Promise<T> {
  const text = await readFile(path, "utf8")
  const ret = JSON.parse(text, reviver)
  if (typeof ret !== "object" || ret === null)
    throw new Error(`Expected JSON object at ${path}, got ${typeof ret}`)
  return ret
}

/**
 * Write JSON to `path` with two guarantees:
 *
 * 1. Locked across processes via `proper-lockfile` so concurrent writers
 *    (UI + manual edit + second zaly instance) don't lose updates when
 *    using the updater form.
 * 2. Atomic on disk via tmp-file + rename — a crashed process never
 *    leaves a half-written file behind. Readers see old-or-new, never
 *    partial.
 */
export async function writeJson<T extends JsonObject = JsonObject>(
  path: string,
  data: T | ((prev?: T) => T)
): Promise<T> {
  return await withLock(path, async () => {
    const value = typeof data === "function" ? data(await safeReadJson<T>(path)) : data
    const text = safeStringify(value, undefined, 2)
    await atomicWriteFile(path, `${text}\n`)
    return value
  })
}

export async function safeReadJson<T extends JsonObject = JsonObject>(
  path: string,
  reviver?: JsonReviver
): Promise<T | undefined> {
  return readJson<T>(path, reviver).catch(() => undefined)
}

export async function safeWriteJson<T extends JsonObject = JsonObject>(
  path: string,
  data: T | ((prev?: T) => T)
): Promise<T | undefined> {
  return writeJson(path, data).catch(() => undefined)
}

export type JsonFileOpts<T extends JsonObject = JsonObject, D extends T | undefined = undefined> = {
  default?: D
  /** Reviver for JSON.parse. */
  reviver?: JsonReviver
  validate?: (data: unknown) => MaybePromise<T>
  mode?: number
}

export class JsonFile<T extends JsonObject = JsonObject, D extends T | undefined = undefined> {
  #opts: JsonFileOpts<T, D>
  #data?: T
  #path: string
  #dir: string
  #default?: D
  #loaded = false

  constructor(path: string, opts: JsonFileOpts<T, D> = {}) {
    this.#path = normPath(path)
    this.#dir = dirname(this.#path)
    this.#opts = opts
    this.#default = opts.default
  }

  get path(): string {
    return this.#path
  }

  get dir(): string {
    return this.#dir
  }

  get $(): D extends undefined ? T | undefined : T {
    if (!this.#loaded)
      throw new Error(`JsonFile at \`${this.path}\` not loaded yet; call \`await refresh()\` first`)
    const ret = this.#data ?? this.#default
    return ret as D extends undefined ? T | undefined : T
  }

  async refresh(): Promise<this> {
    this.#data = undefined
    this.#loaded = true
    const s = await stat(this.path).catch(() => undefined)
    if (!s?.isFile()) return this
    let data = await withError(
      () => readJson(this.path, this.#opts.reviver),
      `Failed to load json file at \`${this.path}\``
    )
    if (this.#opts.validate) data = await this.#opts.validate(data)
    this.#data = data as T | undefined
    return this
  }

  async update(data: T | ((prev?: T) => T)): Promise<this> {
    this.#data = await writeJson(this.#path, data)
    this.#loaded = true
    return this
  }

  get<K extends PropPath<T>>(path: K): PropValue<T, K> | undefined {
    const data = this.$
    return data ? propGet(data, path) : undefined
  }

  async set<K extends PropPath<T>>(path: K, value: PropValue<T, K>): Promise<this> {
    return this.update((prev) => {
      const next = { ...prev } as T
      propSet(next, path, value)
      return next
    })
  }
}

export async function loadJsonFile<
  T extends JsonObject = JsonObject,
  D extends T | undefined = undefined,
>(path: string, opts: JsonFileOpts<T, D> = {}): Promise<JsonFile<T, D>> {
  const ret = new JsonFile<T, D>(path, opts)
  return await ret.refresh()
}
