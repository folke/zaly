import { gitRoot, normPath, safeStat } from "@zaly/shared"
import { homedir } from "node:os"
import { join, dirname } from "pathe"

export type ResourceScope = "user" | "project" | "agent"

export type ResourceOptions<T extends ResourceScope = ResourceScope> = {
  cwd?: string
  rel: string
  scopes: T[]
  type?: "file" | "dir"
}

export type Resource<T extends ResourceScope = ResourceScope> = {
  path: string
  scope: T
}

const AGENTS_DIR = ".agents"

export function findResource<T extends ResourceScope = ResourceScope>(
  opts: ResourceOptions<T>
): Resource<T>[] {
  const cwd = normPath(opts.cwd)
  const ret: Resource<T>[] = []

  const user = opts.scopes.includes("user" as T)
  const project = opts.scopes.includes("project" as T)
  const agent = opts.scopes.includes("agent" as T)

  const want = (path: string) => {
    const stat = safeStat(path)
    if (!stat) return false
    return (
      opts.type === undefined ||
      (opts.type === "file" && stat.isFile()) ||
      (opts.type === "dir" && stat.isDirectory())
    )
  }

  if (project || agent) {
    let current = cwd
    const checks: { scope: T; rel: string }[] = []
    if (agent) checks.push({ rel: `${AGENTS_DIR}/${opts.rel}`, scope: "agent" as T })
    if (project) checks.push({ rel: opts.rel, scope: "project" as T })
    const gitDir = gitRoot(current)
    const root = gitDir
    // oxlint-disable-next-line typescript/no-unnecessary-condition
    while (true) {
      for (const { scope, rel } of checks) {
        const path = join(current, rel)
        if (want(path)) ret.push({ path, scope })
      }
      const next = dirname(current)
      if (next === current || current === root) break // reached git/filesystem root
      current = next
    }
  }

  if (user) {
    const path = join(process.env.HOME ?? homedir(), AGENTS_DIR, opts.rel)
    if (want(path)) ret.push({ path, scope: "user" as T })
  }

  return ret.toReversed() // project should shadow user, so reverse the order
}
