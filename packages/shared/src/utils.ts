import { createHash } from "node:crypto"
import { readFileSync, statSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join, relative, resolve } from "pathe"
import { reverseResolveAlias } from "pathe/utils"

export type AnyFn<A extends any[] = never[], R = unknown> = (...args: A) => R

export function safeFn<T extends AnyFn>(fn: T) {
  return (...args: Parameters<T>): ReturnType<T> | undefined => {
    try {
      return fn(...args) as ReturnType<T>
    } catch {
      return undefined
    }
  }
}

export function safeParseJson(v: unknown): unknown {
  try {
    return JSON.parse(String(v))
  } catch {}
}

export function safeAsyncFn<T extends AnyFn<any[], Promise<any>>>(fn: T) {
  return async (...args: Parameters<T>): Promise<Awaited<ReturnType<T>> | undefined> =>
    fn(...args).catch(() => undefined)
}

export function hash(content: string | Uint8Array): string {
  return createHash("sha256").update(content).digest("hex")
}

export function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err))
}

export const safeReadFile = safeAsyncFn((p: string) => readFile(p, "utf8"))
export const safeReadFileSync = safeFn((path: string) => readFileSync(path, "utf8"))
export const safeStat = safeFn(statSync)

export function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v))
  } catch {
    return String(value)
  }
}

export function findUp(root: string, name: string, stop?: string) {
  let current = resolve(root)
  // oxlint-disable-next-line typescript/no-unnecessary-condition
  while (true) {
    const check = join(current, name)
    if (safeStat(check)) return check
    if (stop && safeStat(join(current, stop))) return // reached stop directory without finding the file
    const next = dirname(current)
    if (next === current) break // reached filesystem root
    current = next
  }
}

// Similar to path.resolve but also expands ~ to the user home
// directory. Accepts undefined / empty entries (filtered out) so
// callers can pass an optional base without a `?? process.cwd()`
// dance — `resolve()` defaults to `process.cwd()` when nothing
// absolute remains.
export function normPath(...paths: (string | undefined)[]) {
  return resolve(
    ...paths.filter((p): p is string => !!p).map((p) => p.replace(/^~(?=\/|\\|$)/, homedir()))
  )
}

export function gitRoot(path: string) {
  const git = findUp(path, ".git")
  return git ? dirname(git) : undefined
}

export function prettyPath(path: string) {
  let rel = relative(process.cwd(), path)
  rel = rel === "" ? "." : rel
  rel = rel.startsWith("..") ? (reverseResolveAlias(path, { "~": homedir() })[0] ?? path) : rel
  return rel
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
