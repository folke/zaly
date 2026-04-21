export type Events = Record<string, unknown[]>

/**
 * Every listener receives the event payload followed by the emitter
 * itself as a trailing argument. That gives listeners a handle to the
 * source (`self`) without needing to close over a named reference:
 *
 * ```ts
 * input({...}).on("submit", (value, self) => {
 *   self.setState({ value: "" })
 * })
 * ```
 *
 * The extra arg is optional in the caller's signature — TypeScript's
 * fewer-params rule lets `(value) => void` be assigned to the declared
 * `(value, self) => void`, so existing listeners that ignore `self`
 * keep compiling.
 */
export interface TypedEmitter<T extends Events> {
  on<K extends keyof T & string>(event: K, fn: (...args: [...T[K], this]) => void): this
  off<K extends keyof T & string>(event: K, fn: (...args: [...T[K], this]) => void): this
  once<K extends keyof T & string>(event: K, fn: (...args: [...T[K], this]) => void): this
  emit<K extends keyof T & string>(event: K, ...args: T[K]): boolean
}

type AnyFn = (...args: unknown[]) => void

export class Emitter<T extends Events = Events> implements TypedEmitter<T> {
  private listeners = new Map<keyof T & string, AnyFn[]>()
  private wrappers = new WeakMap<AnyFn, AnyFn>()

  on<K extends keyof T & string>(event: K, fn: (...args: [...T[K], this]) => void): this {
    const arr = this.listeners.get(event)
    if (arr) arr.push(fn as AnyFn)
    else this.listeners.set(event, [fn as AnyFn])
    return this
  }

  off<K extends keyof T & string>(event: K, fn: (...args: [...T[K], this]) => void): this {
    const arr = this.listeners.get(event)
    if (!arr) return this
    const target = this.wrappers.get(fn as AnyFn) ?? (fn as AnyFn)
    const i = arr.indexOf(target)
    if (i !== -1) arr.splice(i, 1)
    if (arr.length === 0) this.listeners.delete(event)
    return this
  }

  once<K extends keyof T & string>(event: K, fn: (...args: [...T[K], this]) => void): this {
    const wrapper: AnyFn = (...args) => {
      this.off(event, fn)
      ;(fn as AnyFn)(...args)
    }
    this.wrappers.set(fn as AnyFn, wrapper)
    return this.on(event, wrapper as (...args: [...T[K], this]) => void)
  }

  emit<K extends keyof T & string>(event: K, ...args: T[K]): boolean {
    const arr = this.listeners.get(event)
    if (!arr || arr.length === 0) return false
    // Snapshot so mutations during iteration don't affect this dispatch.
    const snapshot = [...arr]
    for (const fn of snapshot) fn(...args, this)
    return true
  }
}
