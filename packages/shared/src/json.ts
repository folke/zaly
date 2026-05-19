import { readFile } from "node:fs/promises"
import { atomicWriteFile, safeStringify, withLock } from "./utils.ts"

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
