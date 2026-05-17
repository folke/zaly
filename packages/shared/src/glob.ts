import type { Ignore } from "ignore"

import { readFileSync } from "node:fs"
import { readdir } from "node:fs/promises"
import { join } from "pathe"
import { normPath } from "./path.ts"
import { findUp, gitRoot, safeStat, toError } from "./utils.ts"

export type GlobOptions = {
  cwd: string
  follow: boolean // follow symlinks
  hidden: boolean // include dot files (those starting with a dot)
  ignore: boolean // respect ignore files
  type?: "file" | "dir" // filter by type
  depth: number // maximum depth to traverse
  ignoreFiles: string[] // names of ignore files to look for in each directory
  exclude: string[] // additional ignore rules to apply globally
  onVisit?: (rel: string) => void
  onMatch?: (rel: string) => void
  onError?: (path: string, error: Error) => void
  signal?: AbortSignal
}

const defaults: GlobOptions = {
  cwd: ".",
  depth: Infinity,
  exclude: [".git", "node_modules/"],
  follow: false,
  hidden: false,
  ignore: true,
  ignoreFiles: [".gitignore", ".ignore"],
  type: "file",
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

async function matcher(patterns: string[]) {
  if (process.versions.bun) {
    const { Glob } = await import("bun")
    const globs = patterns.map((p) => new Glob(p))
    return (path: string) => globs.some((g) => g.match(path))
  }
  const { default: picomatch } = await import("picomatch")
  const isMatch = picomatch(patterns, { dot: true })
  return (path: string) => isMatch(path)
}

const CONCURRENCY = 16

function maxPatternDepth(patterns: readonly string[]): number {
  if (patterns.length === 0) return Infinity // no patterns means we check all files
  let max = 0
  for (const p of patterns) {
    if (p.startsWith("!")) continue // negations don't affect depth
    if (p.includes("**")) return Infinity // globstar matches any depth
    const depth = p.split("/").length
    if (depth > max) max = depth
  }
  return max
}

export async function* glob(
  pattern: string | readonly string[],
  opts: Partial<GlobOptions> = {}
): AsyncGenerator<string> {
  if (opts.depth !== undefined && opts.depth < 1) return // fast path for zero results

  const { default: ignore } = await import("ignore")
  const o: GlobOptions = { ...defaults, ...opts }
  const root = normPath(o.cwd)
  const ignoreFiles = new Set(o.ignoreFiles)
  const rootIgnore = ignore().add([...o.exclude, ...ignoreFiles])

  const patterns = typeof pattern === "string" ? [pattern] : pattern
  o.depth = Math.min(o.depth, maxPatternDepth(patterns))
  const match = patterns.length > 0 ? await matcher([...patterns]) : () => true

  const visited = new Set<string>()
  const matches: string[] = []

  const git = gitRoot(root)
  if (o.ignore)
    for (const igf of ignoreFiles) {
      const igPath = findUp(root, igf, git)
      if (igPath) rootIgnore.add(readFileSync(igPath, "utf8"))
    }

  async function ls(dir: GlobEntry) {
    if (opts.signal?.aborted) return // skip if cancelled mid-flight
    let entries
    try {
      entries = await readdir(dir.path, { withFileTypes: true })
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
      if (ig?.ignores(child.rel)) continue
      if (!child.dir && !match(child.rel)) continue

      if (child.dir) {
        if (visited.has(child.path)) continue
        visited.add(child.path)
        if (child.depth < o.depth) queue.push({ ...child, ignore: ig })
      }

      if (!o.type || o.type === (child.dir ? "dir" : "file")) {
        matches.push(child.rel)
        o.onMatch?.(child.rel)
      }
    }
  }

  const queue: GlobEntry[] = [
    { depth: 0, dir: true, ignore: new IgnoreTree(rootIgnore), path: root, rel: "" },
  ]

  const inflight = new Set<Promise<void>>()
  while (queue.length > 0 || inflight.size > 0) {
    o.signal?.throwIfAborted()

    while (inflight.size < CONCURRENCY && queue.length > 0) {
      const p = ls(queue.pop()!).finally(() => inflight.delete(p))
      inflight.add(p)
    }
    // oxlint-disable-next-line no-await-in-loop
    await Promise.race(inflight)
    yield* matches.splice(0) // yield and clear matches
  }
  yield* matches.splice(0) // yield and clear matches
}
