type NN<T> = NonNullable<T>
type StringKey<T> = keyof NN<T> & string

type Prev = [never, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9]

type PathMatch<T, V> = [NN<T>] extends [V] ? true : false

type PathRecurse<T> =
  NN<T> extends readonly unknown[]
    ? false
    : NN<T> extends (...args: any[]) => any
      ? false
      : NN<T> extends object
        ? true
        : false

type PathForProp<K extends string, T, V, D extends number> = D extends 0
  ? PathMatch<T, V> extends true
    ? readonly [K]
    : never
  : PathRecurse<T> extends true
    ? PathMatch<T, V> extends true
      ? readonly [K] | readonly [K, ...PropPath<T, V, Prev[D]>]
      : readonly [K, ...PropPath<T, V, Prev[D]>]
    : PathMatch<T, V> extends true
      ? readonly [K]
      : never

/** All object paths as string tuple keys, optionally filtered by value type. */
export type PropPath<T, V = unknown, D extends number = 6> =
  NN<T> extends object
    ? {
        [K in StringKey<T>]: PathForProp<K, NN<T>[K], V, D>
      }[StringKey<T>]
    : never

/** The value type located at a specific tuple path in an object type. */
export type PropValue<T, P> = P extends readonly [
  infer K extends StringKey<T>,
  ...infer Rest extends readonly string[],
]
  ? Rest extends readonly []
    ? NN<T>[K]
    : PropValue<NN<T>[K], Rest>
  : never

/** Gets the value located at a specific tuple path. */
export function propGet<T, const P extends PropPath<T>>(
  obj: T,
  path: P
): PropValue<T, P> | undefined {
  let result: any = obj

  for (const part of path) {
    if (result === null || result === undefined) return undefined
    result = result[part]
  }

  return result
}

/** Sets the value located at a specific tuple path. */
export function propSet<T, const P extends PropPath<T>>(
  obj: T,
  path: P,
  value: PropValue<T, P>
): void {
  let result: any = obj

  for (let i = 0; i < path.length - 1; i++) {
    const part = path[i]
    const next = result[part]

    if (next === null || next === undefined) {
      // oxlint-disable-next-line no-multi-assign
      result = result[part] = {}
    } else if (typeof next === "object") {
      result = next
    } else {
      throw new TypeError(
        `Cannot set ${path.join(".")}: ${path.slice(0, i + 1).join(".")} is not an object`
      )
    }
  }

  result[path.at(-1)!] = value
}
