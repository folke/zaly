export type Events = Record<string, unknown[]>

export interface TypedEmitter<T extends Events> {
  on<K extends keyof T>(event: K, fn: (...args: T[K]) => void): this
  off<K extends keyof T>(event: K, fn: (...args: T[K]) => void): this
  once<K extends keyof T>(event: K, fn: (...args: T[K]) => void): this
  emit<K extends keyof T>(event: K, ...args: T[K]): boolean
}

type AnyFn = (...args: unknown[]) => void

export class Emitter<T extends Events = Events> implements TypedEmitter<T> {
  private listeners = new Map<keyof T, AnyFn[]>()
  private wrappers = new WeakMap<AnyFn, AnyFn>()

  on<K extends keyof T>(event: K, fn: (...args: T[K]) => void): this {
    const arr = this.listeners.get(event)
    if (arr) arr.push(fn as AnyFn)
    else this.listeners.set(event, [fn as AnyFn])
    return this
  }

  off<K extends keyof T>(event: K, fn: (...args: T[K]) => void): this {
    const arr = this.listeners.get(event)
    if (!arr) return this
    const target = this.wrappers.get(fn as AnyFn) ?? (fn as AnyFn)
    const i = arr.indexOf(target)
    if (i !== -1) arr.splice(i, 1)
    if (arr.length === 0) this.listeners.delete(event)
    return this
  }

  once<K extends keyof T>(event: K, fn: (...args: T[K]) => void): this {
    const wrapper: AnyFn = (...args) => {
      this.off(event, fn)
      ;(fn as AnyFn)(...args)
    }
    this.wrappers.set(fn as AnyFn, wrapper)
    return this.on(event, wrapper as (...args: T[K]) => void)
  }

  emit<K extends keyof T>(event: K, ...args: T[K]): boolean {
    const arr = this.listeners.get(event)
    if (!arr || arr.length === 0) return false
    // Snapshot so mutations during iteration don't affect this dispatch.
    const snapshot = [...arr]
    for (const fn of snapshot) fn(...args)
    return true
  }
}
