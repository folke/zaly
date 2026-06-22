export type MaybePromise<T = void> = T | Promise<T>

export type Simplify<T> = { [K in keyof T]: T[K] } & {}

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends readonly unknown[]
    ? T[K]
    : T[K] extends object
      ? Simplify<DeepPartial<T[K]>>
      : T[K]
}
