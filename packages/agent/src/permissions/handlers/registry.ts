import type { PermissionHandler } from "../types.ts"

import { createRegistry } from "@zaly/shared/registry"
import { bashHandler } from "./bash.ts"
import { fileHandler } from "./files.ts"
import { toolHandler } from "./tool.ts"

const builtin = {
  bash: () => bashHandler,
  read: () => fileHandler,
  tool: () => toolHandler,
  write: () => fileHandler,
} as const

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
 *  to register a runtime handler via `handlerRegistry.register("fetch", …)`
 *  — this interface is only the type-side declaration.
 */
export interface PermissionScopes {
  bash: string
  read: string
  tool: string
  write: string
}

export type BuiltinScope = keyof typeof builtin
export type PermissionScope = keyof PermissionScopes
export type AnyScope = PermissionScope | (string & {})

export const handlerRegistry = createRegistry<PermissionHandler<string>>("scope").from(builtin)
