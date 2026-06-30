import type { ConfigScope } from "../types.ts"

import { encodePath, normPath } from "@zaly/shared"
import { join } from "pathe"

type PU =
  | {
      type: "git"
      repo: string
      ref?: string
    }
  | {
      type: "npm"
      name: string
      version?: string
    }
  | {
      type: "dir"
      path: string
    }

export type PluginType = PU["type"]
export type PluginUri<T extends PluginType = PluginType> = Extract<PU, { type: T }>
export type PluginRef<T extends PluginType = PluginType> = PluginUri<T> & {
  uri: string
  /** Absolute path for this pack. */
  dir: string

  /** Shared store root for packs of this type. */
  store: string
  scope: ConfigScope
}

export function pluginUri(
  uri: `git:${string}` | `http:${string}` | `https:${string}` | `ssh:${string}`
): PluginUri<"git">
export function pluginUri(uri: `npm:${string}`): PluginUri<"npm">
export function pluginUri(uri: string): PluginUri
export function pluginUri(uri: string): PluginUri {
  const m = uri.match(/^(?<protocol>npm|git|ssh|https?):(?<target>.+?)(?:@(?<ref>[^@/]+))?$/)
  if (!m) return { path: uri, type: "dir" }

  const g = (m.groups ?? {}) as { protocol: string; target: string; ref?: string }
  let ref = g.ref?.trim()
  ref = ref === "" ? undefined : ref
  return g.protocol === "npm"
    ? { name: g.target, type: "npm", version: ref }
    : { ref, repo: `${g.protocol}:${g.target}`, type: "git" }
}

export function pluginRef(
  uri: string,
  opts: { cwd: string; data: string; scope: ConfigScope }
): PluginRef {
  const parsed = pluginUri(uri)
  const store = join(opts.data, "packs", parsed.type)
  let dir: string
  if (parsed.type === "dir") dir = normPath(opts.cwd, parsed.path)
  else if (parsed.type === "git") dir = join(store, encodePath(parsed.repo))
  else dir = join(store, "node_modules", parsed.name)
  return { ...parsed, dir, scope: opts.scope, store, uri }
}
