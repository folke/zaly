import { createHash } from "node:crypto"
import { statSync, readFileSync } from "node:fs"
import { readFile } from "node:fs/promises"

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
