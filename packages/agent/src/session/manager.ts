import { encodePath, normPath } from "@zaly/shared"
import { stat, mkdir } from "node:fs/promises"
import { basename, dirname } from "pathe"
import { glob } from "../utils/glob.ts"
import { zalyPaths } from "../utils/paths.ts"
import { uuidv7 } from "../utils/uuid.ts"
import { Session } from "./session.ts"

export type ManagedSession = {
  id: string
  scope: string
  path: string
  dir: string
  cwd?: string
  mtime?: number
}

export type SessionScope = {
  id?: string
  scope?: string
  cwd?: string
} & ({ scope: string } | { cwd: string }) // require at least one of scope or cwd

export function projectScope(cwd?: string) {
  return encodePath(normPath(cwd))
}

export async function sessionList(opts: Partial<SessionScope> & { sort?: boolean } = {}) {
  const filter = opts.scope ?? (opts.cwd ? projectScope(opts.cwd) : undefined)
  const root = normPath(`${zalyPaths.sessions}/${filter ?? ""}`)
  const pattern: string[] = []
  if (!filter) pattern.push("*")
  pattern.push(opts.id ?? "*")
  pattern.push("session.jsonl")
  const paths = glob({
    cwd: root,
    depth: pattern.length,
    glob: pattern.join("/"), // format: {scope}/{id}/session.jsonl
    ignore: false,
    type: "file",
  })
  const ret: ManagedSession[] = []
  for await (const rel of paths) {
    const path = normPath(`${root}/${rel}`)
    const dir = dirname(path)
    const id = basename(dir)
    const scope = basename(dirname(dir))
    ret.push({ dir, id, path, scope })
  }
  if (!opts.sort) return ret
  const stats = await Promise.all(
    ret.map(async (session) => {
      const s = await stat(session.path).catch(() => undefined)
      session.mtime = s?.mtimeMs
      return session
    })
  )
  return stats
    .filter((e): e is ManagedSession & { mtime: number } => e.mtime !== undefined)
    .toSorted((a, b) => b.mtime - a.mtime) // newest first
}

export function sessionCreate(opts: SessionScope) {
  const scope = opts.scope ?? projectScope(opts.cwd)
  const id = opts.id ?? uuidv7()
  const dir = normPath(`${zalyPaths.sessions}/${scope}/${id}`)
  const path = normPath(`${dir}/session.jsonl`)
  return sessionLoad({ cwd: opts.cwd, dir, id, path, scope })
}

export async function sessionResume(opts: SessionScope): Promise<Session | undefined> {
  const scope = opts.scope ?? projectScope(opts.cwd)
  const list = await sessionList({ scope, sort: true })
  return list.length === 0 ? undefined : sessionLoad(list[0])
}

export async function sessionLoad(opts: ManagedSession): Promise<Session> {
  await mkdir(opts.dir, { recursive: true })
  return Session.load(opts)
}
