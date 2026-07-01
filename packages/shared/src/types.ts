/** A type that can be either a value of type T or a Promise that resolves to a value of type T. */
export type MaybePromise<T = void> = T | Promise<T>

type SkipSimplify = Date | RegExp | Map<any, any> | Set<any> | string

/** Simplify a type by flattening its properties. */
export type Simplify<T> = T extends SkipSimplify ? T : { [K in keyof T]: T[K] } & {}

/** Recursively simplify a type by flattening its properties. */
export type SimplifyDeep<T> = T extends SkipSimplify
  ? T
  : T extends (infer U)[]
    ? SimplifyDeep<U>[]
    : T extends object
      ? { [K in keyof T]: SimplifyDeep<T[K]> } & {}
      : T

/** Recursively make all properties of a type optional. */
export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends readonly unknown[]
    ? T[K]
    : T[K] extends object
      ? Simplify<DeepPartial<T[K]>>
      : T[K]
}
