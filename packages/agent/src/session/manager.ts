import type { Stats } from "node:fs"

import { decodePath, encodePath, normPath, safeStatAsync } from "@zaly/shared"
import { glob } from "@zaly/shared/glob"
import { zalyPaths } from "@zaly/shared/paths"
import { mkdir, stat } from "node:fs/promises"
import { basename, dirname, join, relative } from "pathe"
import { isUuidv7Like, uuidv7 } from "../utils/uuid.ts"
import { Session } from "./session.ts"

export type SessionInfo = {
  /** uuidv7 session id. Absent for non-managed external paths until the
   *  session is loaded — the file's session-start node carries the
   *  authoritative id. */
  id: string
  /** Absolute path to the session file. Typically within `zalyPaths.sessions`. */
  path: string
  /** Data directory used for session artifacts */
  dir: string
  /** The session's workspace containing its .zaly/ resources */
  workspace: string
  /** Populated when listing with `sort: true` */
  mtime?: number
  stat?: Stats
}

export type SessionFilter = {
  /** (partial) uuid for a session */
  id?: string
  /** sessions with this workspace */
  workspace?: string
  /** glob pattern matching any workspace sessions */
  pattern?: string
}

export type SessionListOpts = {
  filter?: string | SessionFilter
  sort?: boolean
}

async function toFilter(filter: string): Promise<SessionFilter> {
  if (isUuidv7Like(filter)) return { id: filter }
  const s = await safeStatAsync(filter)
  if (s?.isDirectory()) return { workspace: filter }
  return { pattern: filter }
}

function workspaceSlug(workspace?: string) {
  return encodePath(normPath(workspace))
}

export async function listSessions(opts: SessionListOpts = {}) {
  const filter = typeof opts.filter === "string" ? await toFilter(opts.filter) : (opts.filter ?? {})
  let slug = filter.workspace ? workspaceSlug(filter.workspace) : undefined
  slug ??= filter.pattern ? `*${filter.pattern}*` : undefined
  slug ??= "*"
  const isGlob = slug.includes("*")
  const root = isGlob ? zalyPaths.sessions : join(zalyPaths.sessions, slug)

  const pattern: string[] = []
  if (isGlob) pattern.push(slug)

  if (filter.id) pattern.push(filter.id.length >= 36 ? filter.id.slice(0, 36) : `${filter.id}*`)
  else pattern.push("*")

  pattern.push("session.jsonl")

  const paths = glob(pattern.join("/"), {
    cwd: root,
    depth: pattern.length,
    ignore: false,
    type: "file",
  })
  const ret: SessionInfo[] = []
  for await (const rel of paths) {
    const path = normPath(root, rel)
    ret.push(sessionInfo({ path }))
  }
  if (!opts.sort) return ret
  const stats = await Promise.all(
    ret.map(async (session) => {
      const s = await stat(session.path).catch(() => undefined)
      session.mtime = s?.mtimeMs
      session.stat = s
      return session
    })
  )
  return stats
    .filter((e): e is SessionInfo & { mtime: number } => e.mtime !== undefined)
    .toSorted((a, b) => b.mtime - a.mtime) // newest first
}

export async function resumeSession(filter: string | SessionFilter): Promise<Session | undefined> {
  const list = await listSessions({ filter, sort: true })
  return list.length === 0 ? undefined : loadSession(list[0])
}

export async function loadSession(opts: Partial<SessionInfo> = {}): Promise<Session> {
  const info = sessionInfo(opts)
  await mkdir(info.dir, { recursive: true })
  return Session.load({
    defaults: {
      cwd: normPath(),
      sessionId: info.id,
      workspace: info.workspace,
    },
    dir: info.dir,
    path: info.path,
  })
}

export function sessionInfo(opts: Partial<SessionInfo> = {}): SessionInfo {
  if (opts.path && !relative(zalyPaths.sessions, opts.path).startsWith("..")) {
    // Managed session
    const path = normPath(opts.path)
    const dir = normPath(opts.dir ?? dirname(path))
    const id = opts.id ?? basename(dir)
    const slug = basename(dirname(dir))
    const workspace = normPath(opts.workspace ?? decodePath(slug))
    return { dir, id, path, workspace }
  } else if (opts.path) {
    // Existing session, but not in a managed location
    const path = normPath(opts.path)
    const dir = normPath(opts.dir ?? dirname(path))
    const workspace = normPath(opts.workspace)
    return { dir, id: uuidv7(), path, workspace }
  }
  // New session
  const workspace = normPath(opts.workspace) // defaults to cwd
  const slug = workspaceSlug(workspace)
  const id = opts.id ?? uuidv7()
  const dir = opts.dir ? normPath(opts.dir) : normPath(zalyPaths.sessions, slug, id)
  const path = normPath(dir, "session.jsonl")
  return { dir, id, path, workspace }
}
