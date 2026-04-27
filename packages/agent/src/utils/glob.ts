import type { Ignore } from "ignore"
import type { Dirent } from "node:fs"

import { findUp, normPath, safeStat, toError } from "@zaly/shared"
import { readFileSync } from "node:fs"
import { readdir } from "node:fs/promises"
import { join } from "pathe"

export type GlobSort = (a: Dirent, b: Dirent) => number

const sorters = {
  name: (a, b) => a.name.localeCompare(b.name),
  none: () => 0,
  type: (a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1
    if (!a.isDirectory() && b.isDirectory()) return 1
    return a.name.localeCompare(b.name)
  },
} satisfies Record<string, GlobSort>

export type GlobOptions = {
  cwd: string | string[]
  glob?: string | string[] // optional glob patterns to filter files (e.g. "*.js")
  follow: boolean // follow symlinks
  hidden: boolean // include hidden files (those starting with a dot)
  ignore: boolean // respect ignore files
  type?: "file" | "directory" // filter by type
  empty: boolean // include empty directories
  depth: number // maximum depth to traverse
  ignoreFiles: string[] // names of ignore files to look for in each directory
  exclude: string[] // additional ignore rules to apply globally
  onVisit?: (rel: string) => void
  onError?: (path: string, error: Error) => void
  sort?: GlobSort | keyof typeof sorters
}

const defaults: GlobOptions = {
  cwd: ".",
  depth: Infinity,
  empty: false,
  exclude: [".git", "node_modules/"],
  follow: false,
  hidden: false,
  ignore: true,
  ignoreFiles: [".gitignore", ".ignore"],
  sort: "name",
}

type GlobEntry = {
  path: string
  rel: string
  ignore?: IgnoreTree
  depth: number
  dir: boolean
}

class IgnoreTree {
  parent?: IgnoreTree

  constructor(
    public ig: Ignore,
    public rel = ""
  ) {}

  extend(ig: Ignore, rel: string) {
    const child = new IgnoreTree(ig, rel)
    child.parent = this
    return child
  }

  ignores(rel: string): boolean {
    const test = this.ig.test(rel.slice(this.rel.length))
    if (test.ignored) return true
    if (test.unignored) return false
    return this.parent?.ignores(rel) ?? false
  }
}

export async function* glob(opts: Partial<GlobOptions> = {}): AsyncGenerator<string> {
  if (opts.depth && opts.depth < 1) return // fast path for zero results

  const { default: ignore } = await import("ignore")
  const o: GlobOptions = { ...defaults, ...opts }
  if (Array.isArray(o.cwd)) {
    for (const cwd of o.cwd) yield* glob({ ...o, cwd })
    return
  }
  const root = normPath(o.cwd)
  const ignoreFiles = new Set(o.ignoreFiles)
  const rootIgnore = ignore().add([...o.exclude, ...ignoreFiles])
  const globIgnore = ignore().add(o.glob ?? [])
  const sorter = (typeof o.sort === "string" ? sorters[o.sort] : o.sort) ?? sorters.name
  const visited = new Set<string>()

  if (o.ignore)
    for (const igf of ignoreFiles) {
      const igPath = findUp(root, igf, ".git")
      if (igPath) rootIgnore.add(readFileSync(igPath, "utf8"))
    }

  async function ls(dir: GlobEntry) {
    if (visited.has(dir.path)) return
    visited.add(dir.path)
    let entries
    try {
      const dirents = await readdir(dir.path, { withFileTypes: true })
      entries = dirents.toSorted(sorter).toReversed()
    } catch (error) {
      return o.onError?.(dir.path, toError(error))
    }

    let ig = dir.ignore
    const children: GlobEntry[] = []

    for (const entry of entries) {
      const path = join(entry.parentPath, entry.name)
      if (o.ignore && entry.isFile() && ignoreFiles.has(entry.name)) {
        const fig = ignore().add(readFileSync(path, "utf8"))
        ig = ig ? ig.extend(fig, dir.rel) : new IgnoreTree(fig, dir.rel)
      } else if (!o.hidden && entry.name.startsWith(".")) {
        continue
      } else {
        let isDirectory = entry.isDirectory()
        isDirectory ||=
          o.follow && entry.isSymbolicLink() && (safeStat(path)?.isDirectory() ?? false)
        const rel = dir.rel + entry.name + (isDirectory ? "/" : "")
        const depth = dir.depth + 1
        children.push({ depth, dir: isDirectory, path, rel })
      }
    }

    for (const child of children) {
      o.onVisit?.(child.rel)
      if (o.ignore && ig?.ignores(child.rel)) continue
      if (o.glob && !child.dir && !globIgnore.ignores(child.rel)) continue
      stack.push({ ...child, ignore: ig })
    }
  }

  const stack: GlobEntry[] = [
    { depth: 0, dir: true, ignore: new IgnoreTree(rootIgnore), path: root, rel: "" },
  ]
  const parents: GlobEntry[] = []

  while (stack.length > 0) {
    const entry = stack.pop()!

    if (o.type !== "file" && entry.depth !== 0) {
      while (!o.empty && parents.length > 0 && parents[parents.length - 1].depth >= entry.depth)
        parents.pop()
      if (entry.dir && entry.depth < o.depth) {
        parents.push(entry)
      } else {
        for (const p of parents) yield p.rel
        parents.length = 0
        if (o.type !== "directory") yield entry.rel
      }
    } else if (!entry.dir) yield entry.rel

    // oxlint-disable-next-line no-await-in-loop
    if (entry.dir && entry.depth < o.depth) await ls(entry)
  }
}
