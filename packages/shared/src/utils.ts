import { createHash } from "node:crypto"
import { readFileSync, statSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { dirname, join, resolve } from "pathe"

export type AnyFn<A extends any[] = never[], R = unknown> = (...args: A) => R

type SafeReturn<T extends AnyFn> =
  ReturnType<T> extends Promise<infer R> ? Promise<R | undefined> : ReturnType<T> | undefined

export function safeFn<T extends AnyFn>(fn: T) {
  return (...args: Parameters<T>): SafeReturn<T> => {
    try {
      const ret = fn(...args) as ReturnType<T>
      return (ret instanceof Promise ? ret.catch(() => undefined) : ret) as SafeReturn<T>
    } catch {
      return undefined as SafeReturn<T>
    }
  }
}

export function safeParseJson(v: unknown): unknown {
  try {
    return JSON.parse(String(v))
  } catch {}
}

export function hash(content: string | Uint8Array, len = 16): string {
  return createHash("sha256").update(content).digest("hex").slice(0, len)
}

export function randomHash(len?: number): string {
  return hash(`${Date.now()}-${Math.random()}`, len)
}

export function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err))
}

export const safeReadFile = safeFn((p: string) => readFile(p, "utf8"))
export const safeReadFileSync = safeFn((path: string) => readFileSync(path, "utf8"))
export const safeStat = safeFn(statSync)

/** JSON.stringify with two safety guarantees:
 *    1. BigInt values are coerced to their decimal string (default
 *       JSON.stringify throws on BigInt).
 *    2. Any throw — circular refs, non-coercible exotic values — is
 *       caught and falls back to `String(value)` instead of propagating.
 *  An optional `replacer` is applied *after* BigInt coercion so callers
 *  can layer additional transformations (omit fields, redact, etc.). */
export function safeStringify(
  value: unknown,
  replacer?: (key: string, value: unknown) => unknown
): string {
  try {
    return JSON.stringify(value, (k, v) => {
      const coerced = typeof v === "bigint" ? v.toString() : v
      return replacer ? replacer(k, coerced) : coerced
    })
  } catch {
    return String(value)
  }
}

export type FindUpOpts<T extends boolean = boolean> = {
  stop?: string | string[]
  all?: T
  type?: "file" | "dir"
}

/**
 * Walk up the directory tree from `root` looking for `name`.
 *
 * @param name  Basename of file/dir to find at each level.
 * @param opts.stop  Inclusive boundary — walk stops after checking this directory.
 *                   Pass a `gitRoot()` result to bound the walk to the project.
 * @param opts.all   When true, returns all matches (closest first). Default returns first.
 */
export function findUp(
  root: string,
  name: string | string[],
  opts?: Partial<FindUpOpts<false>>
): string | undefined
export function findUp(root: string, name: string | string[], opts: FindUpOpts<true>): string[]
export function findUp(
  root: string,
  name: string | string[],
  opts: FindUpOpts = {}
): string | string[] | undefined {
  let current = resolve(root)
  const stop = new Set(
    (typeof opts.stop === "string" ? [opts.stop] : (opts.stop ?? [])).map((p) => resolve(p))
  )
  const names = Array.isArray(name) ? name : [name]
  const ret: string[] = []
  // oxlint-disable-next-line typescript/no-unnecessary-condition
  main: while (true) {
    for (const n of names) {
      const check = join(current, n)
      const s = safeStat(check)
      const t = s?.isDirectory() ? "dir" : "file"
      if (s && (!opts.type || opts.type === t)) {
        ret.push(check)
        if (!opts.all) break main
      }
    }
    if (stop.has(current)) break // reached stop directory without finding the file
    const next = dirname(current)
    if (next === current) break // reached filesystem root
    current = next
  }
  return opts.all ? ret : ret[0]
}

export function gitRoot(path: string) {
  const git = findUp(path, ".git")
  return git ? dirname(git) : undefined
}

export function withError<T>(fn: () => T, errorMsg: string): T {
  try {
    return fn()
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    throw new Error(`${errorMsg}: ${msg}`, { cause: error })
  }
}

/** Humanized elapsed-time string between two epoch-ms timestamps. */
export function since(from: number, to = Date.now()): string {
  const ms = to - from
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return m % 60 === 0 ? `${h}h` : `${h}h ${m % 60}m`
  const d = Math.floor(h / 24)
  return h % 24 === 0 ? `${d}d` : `${d}d ${h % 24}h`
}

export function clamp(num: number, min?: number, max?: number): number {
  return Math.min(max ?? num, Math.max(min ?? num, num))
}
