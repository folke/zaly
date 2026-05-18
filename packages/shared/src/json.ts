import { readFile } from "node:fs/promises"
import { atomicWriteFile, safeStringify, withLock } from "./utils.ts"

export type JsonObject = { [Key in string]: JsonValue }
export type JsonArray = JsonValue[] | readonly JsonValue[]
export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonObject | JsonArray

export async function readJson<T extends JsonObject = JsonObject>(path: string): Promise<T> {
  const text = await readFile(path, "utf8")
  const ret = JSON.parse(text)
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
  path: string
): Promise<T | undefined> {
  return readJson<T>(path).catch(() => undefined)
}

export async function safeWriteJson<T extends JsonObject = JsonObject>(
  path: string,
  data: T | ((prev?: T) => T)
): Promise<T | undefined> {
  return writeJson(path, data).catch(() => undefined)
}
