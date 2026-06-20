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
      dir: string
    }

export type PackType = PU["type"]
export type PackUri<T extends PackType = PackType> = Extract<PU, { type: T }>

export type PackPath<T extends PackType = PackType> = {
  /** Original configured URI. */
  uri: string

  /** Parsed URI. */
  parsed: PackUri<T>

  /** Concrete path for this pack. */
  dir: string

  /** Shared store root for packs of this type. */
  store: string
}

export function isPackType<T extends PackType>(parsed: PackUri, type: T): parsed is PackUri<T> {
  return parsed.type === type
}

export function assertPackType<T extends PackType>(
  parsed: PackUri,
  type: T
): asserts parsed is PackUri<T> {
  if (!isPackType(parsed, type)) {
    throw new Error(`Expected pack type ${type}, got ${parsed.type}`)
  }
}

export function parsePackUri(
  uri: `git:${string}` | `http:${string}` | `https:${string}` | `ssh:${string}`
): PackUri<"git">
export function parsePackUri(uri: `npm:${string}`): PackUri<"npm">
export function parsePackUri(uri: string): PackUri
export function parsePackUri(uri: string): PackUri {
  const m = uri.match(/^(?<protocol>npm|git|ssh|https?):(?<target>.+?)(?:@(?<ref>[^@/]+))?$/)
  if (!m) return { dir: uri, type: "dir" }

  const g = (m.groups ?? {}) as { protocol: string; target: string; ref?: string }
  let ref = g.ref?.trim()
  ref = ref === "" ? undefined : ref
  return g.protocol === "npm"
    ? { name: g.target, type: "npm", version: ref }
    : { ref, repo: `${g.protocol}:${g.target}`, type: "git" }
}

export function packPath(uri: string, opts: { cwd: string; data: string }): PackPath {
  const parsed = parsePackUri(uri)
  const store = join(opts.data, "packs", parsed.type)
  let dir: string
  if (parsed.type === "dir") dir = normPath(opts.cwd, parsed.dir)
  else if (parsed.type === "git") dir = join(store, encodePath(parsed.repo))
  else dir = join(store, "node_modules", parsed.name)
  return { dir, parsed, store, uri }
}
