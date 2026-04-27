import type { PermissionHandler } from "../types.ts"

import { bashHandler } from "./bash/index.ts"
import { fileHandler } from "./files.ts"

const builtin = {
  bash: bashHandler,
  read: fileHandler,
  write: fileHandler,
} as const satisfies Record<string, PermissionHandler<string>>

const handlers = new Map<string, PermissionHandler<string>>(Object.entries(builtin))

/** Register a handler under one or more scopes. The same instance
 *  can serve multiple scopes — `FileHandler` typically registers under
 *  both `"read"` and `"write"` so they share workspace state. */
export function registerHandler<T extends string>(
  scopes: T | readonly T[],
  handler: PermissionHandler<T>
): void {
  const list = Array.isArray(scopes) ? scopes : [scopes as T]
  for (const scope of list) handlers.set(scope, handler as PermissionHandler<string>)
}

export function getHandler<T extends string>(scope: T): PermissionHandler<T> | undefined {
  return handlers.get(scope) as PermissionHandler<T> | undefined
}
