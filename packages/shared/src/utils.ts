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

export const safeReadFile = safeAsyncFn(readFile)
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

// Similar to path.resolve but also expands ~ to the user home directory
export function normPath(...paths: string[]) {
  return resolve(...paths.map((p) => p.replace(/^~(?=\/|\\|$)/, homedir())))
}

export function gitRoot(path: string) {
  return findUp(path, ".git")
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
