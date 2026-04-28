import type { PermissionHandler } from "../types.ts"

import { bashHandler } from "./bash/index.ts"
import { fileHandler } from "./files.ts"
import { toolHandler } from "./tool.ts"

const builtin = {
  bash: bashHandler,
  read: fileHandler,
  tool: toolHandler,
  write: fileHandler,
} as const satisfies Record<string, PermissionHandler<string>>

const handlers = new Map<string, PermissionHandler<string>>(Object.entries(builtin))

/** Open registry of permission scopes — declaration-merge to add your
 *  own. The keys give `ctx.need("…", input)` typed autocomplete and
 *  catch typos at compile time. The value carries the *input* type for
 *  that scope (almost always `string` — files take paths, bash takes
 *  commands, the generic `tool` scope takes the tool name).
 *
 *  Built-ins:
 *    - `bash`  → command string
 *    - `read`  → absolute path
 *    - `write` → absolute path
 *    - `tool`  → tool name (or richer `name:arg` shape per tool)
 *
 *  Add your own scope:
 *
 *  ```ts
 *  declare module "@zaly/agent" {
 *    interface PermissionScopes {
 *      fetch: string  // expects a domain (or "*" for any)
 *    }
 *  }
 *  ```
 *
 *  Then `ctx.need("fetch", domain)` is typed end-to-end. You still need
 *  to register a runtime handler via `registerHandler("fetch", …)` —
 *  this interface is only the type-side declaration.
 */
export interface PermissionScopes {
  bash: string
  read: string
  tool: string
  write: string
}

export type PermissionScope = keyof PermissionScopes
export type PermissionHandlers = typeof builtin

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
