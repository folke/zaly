// oxlint-disable no-await-in-loop
import type { Ignore } from "ignore"
import type { Dirent } from "node:fs"

import { readdir, realpath } from "node:fs/promises"
import { dirname } from "pathe"
import { normPath } from "./path.ts"
import { findUp, gitRoot, safeReadFile, safeStatAsync, toError } from "./utils.ts"

export type GlobOptions = {
  cwd: string
  /** follow symlinks **/
  follow: boolean
  /** include dot files (those starting with a dot) **/
  hidden: boolean
  /** respect ignore files **/
  ignore: boolean
  /** filter by type **/
  type?: "file" | "dir"
  /** maximum depth to traverse **/
  depth: number
  /** names of ignore files to look for in each directory **/
  ignoreFiles: string[]
  /** additional ignore rules to apply globally **/
  exclude: string[]
  /** callback for each visited file or directory **/
  onVisit?: (rel: string) => void
  /** callback for each matched file or directory **/
  onMatch?: (rel: string) => void
  /** callback for errors **/
  onError?: (path: string, error: Error) => void
  /** abort signal **/
  signal?: AbortSignal
  /** maximum number of matches to return **/
  limit?: number
  /** delay in ms between yielding batches of matches (default: 0, i.e. yield one by one) **/
  throttle?: number
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
  ignore: Ignores
  depth: number
  visited?: Set<string>
}

class Ignores {
  #ignores: { ig: Ignore; cwd: string }[] = []

  constructor(ignores?: { ig: Ignore; cwd: string }[] | { ig: Ignore; cwd: string }) {
    if (ignores) this.#ignores = Array.isArray(ignores) ? [...ignores] : [ignores]
  }

  clone() {
    return new Ignores(this.#ignores)
  }

  async add(igf: string) {
    const ig = await readIgnore(igf)
    if (!ig) return
    this.#ignores.push({ cwd: dirname(igf), ig })
  }

  /** `path` must be absolute. Pass `dir: true` for directories. */
  ignores(path: string, dir?: boolean): boolean {
    for (let i = this.#ignores.length - 1; i >= 0; i--) {
      const { ig, cwd } = this.#ignores[i]
      if (path === cwd) continue
      let rel = path.slice(cwd.length + 1)
      if (dir) rel += "/" // ensure directories end with a slash for matching
      const test = ig.test(rel)
      if (test.ignored) return true
      if (test.unignored) return false
    }
    return false
  }
}

async function readIgnore(path: string): Promise<Ignore | undefined> {
  const { default: ignore } = await import("ignore")
  const content = await safeReadFile(path)
  return content === undefined ? undefined : ignore().add(content)
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

export function glob(
  pattern?: string | readonly string[],
  opts?: Partial<GlobOptions> & { throttle?: 0 }
): AsyncGenerator<string>
export function glob(
  pattern?: string | readonly string[],
  opts?: Partial<GlobOptions>
): AsyncGenerator<string[]>
export async function* glob(
  pattern?: string | readonly string[],
  opts: Partial<GlobOptions> = {}
): AsyncGenerator<string | string[]> {
  const { default: ignore } = await import("ignore")
  const o: GlobOptions = { ...defaults, ...opts }
  const root = normPath(o.cwd)
  const ignoreFiles = new Map<string, number>(o.ignoreFiles.map((igf, i) => [igf, i]))
  const rootIgnore = new Ignores({
    cwd: root,
    ig: ignore().add([...o.exclude, ...ignoreFiles.keys()]),
  })
  const patterns = (typeof pattern === "string" ? [pattern] : (pattern ?? [])).filter(
    (p) => p.trim() !== ""
  )
  o.depth = Math.min(o.depth, maxPatternDepth(patterns))
  const match = patterns.length > 0 ? await matcher([...patterns]) : () => true
  const visited = o.follow ? new Set<string>([await realpath(root)]) : undefined
  const matches: string[] = []
  let count = 0
  let stopped = false
  o.signal?.addEventListener("abort", () => {
    stopped = true
  })

  if (o.ignore) {
    const git = gitRoot(root)
    // findUp walks up and check files in order, so we need to reverse inner and outer,
    // to keep correct precedence (closest ignore file should override rules from parent directories)
    const paths = findUp(root, [...ignoreFiles.keys()].toReversed(), {
      all: true,
      stop: git,
      type: "file",
    })
      .filter((p) => dirname(p) !== root)
      .toReversed()
    for (const p of paths) await rootIgnore.add(p)
  }

  async function ls(dir: GlobEntry) {
    if (stopped) return
    let entries: (Dirent & { skip?: boolean })[]
    try {
      entries = await readdir(dir.path, { withFileTypes: true })
      // oxlint-disable-next-line typescript/no-unnecessary-condition
      if (stopped) return
    } catch (error) {
      return o.onError?.(dir.path, toError(error))
    }

    let ig = dir.ignore

    let ignoreAdd: { igf: string; order: number }[] | undefined

    // First pass to find ignore files and build ignore tree
    for (const entry of entries) {
      if (o.ignore && entry.isFile() && ignoreFiles.has(entry.name)) {
        entry.skip = true // mark ignore files to skip in the main loop
        ignoreAdd ??= []
        ignoreAdd.push({ igf: `${dir.path}/${entry.name}`, order: ignoreFiles.get(entry.name)! })
      }
    }

    if (ignoreAdd) {
      // sort by priority to ensure consistent order of ignore rules
      ignoreAdd.sort((a, b) => a.order - b.order)
      ig = ig.clone()
      for (const { igf } of ignoreAdd) await ig.add(igf)
    }

    // Second pass to process entries
    for (const entry of entries) {
      // oxlint-disable-next-line typescript/no-unnecessary-condition
      if (stopped) return // check if stopped before processing each entry
      if (entry.skip) continue // skip already processed ignore files
      if (!o.hidden && entry.name.startsWith(".")) continue
      const path = `${dir.path}/${entry.name}`
      let isDirectory = entry.isDirectory()
      if (!isDirectory && o.follow && entry.isSymbolicLink()) {
        const stat = await safeStatAsync(path)
        // oxlint-disable-next-line typescript/no-unnecessary-condition
        if (stopped) return
        isDirectory = stat?.isDirectory() ?? false
      }
      const rel = dir.rel + entry.name + (isDirectory ? "/" : "")
      const depth = dir.depth + 1
      o.onVisit?.(rel)

      if (ig.ignores(path, isDirectory)) continue

      // traversal — never gated by the user pattern
      if (isDirectory) {
        let childVisited: Set<string> | undefined
        if (o.follow) {
          const realPath = await realpath(path).catch(() => undefined)
          // oxlint-disable-next-line typescript/no-unnecessary-condition
          if (stopped) return
          if (!realPath || dir.visited?.has(realPath)) continue
          childVisited = new Set(dir.visited).add(realPath)
        }
        if (depth < o.depth) queue.push({ depth, ignore: ig, path, rel, visited: childVisited })
      }

      // emission — gated by type AND pattern
      if (!o.type || o.type === (isDirectory ? "dir" : "file")) {
        if (match(isDirectory ? rel.slice(0, -1) : rel)) {
          matches.push(rel)
          o.onMatch?.(rel)
          count++
          if (o.limit && count >= o.limit) {
            stopped = true
            queue.length = 0
            return
          }
        }
      }
    }
  }

  const queue: GlobEntry[] = [{ depth: 0, ignore: rootIgnore, path: root, rel: "", visited }]

  const inflight = new Set<Promise<void>>()
  let lastYield = performance.now()
  let sleep = Promise.withResolvers()
  let error: unknown

  while (queue.length > 0 || inflight.size > 0) {
    o.signal?.throwIfAborted()
    // oxlint-disable-next-line typescript/no-unnecessary-condition
    if (stopped) break
    if (error) throw error

    while (inflight.size < CONCURRENCY && queue.length > 0) {
      const p = ls(queue.pop()!)
        .finally(() => {
          inflight.delete(p)
          sleep.resolve()
        })
        // oxlint-disable-next-line unicorn/catch-error-name
        .catch((e) => {
          error ??= e
          stopped = true
          queue.length = 0
        })
      inflight.add(p)
    }

    if (inflight.size > 0) {
      await sleep.promise
      sleep = Promise.withResolvers()
    }

    // oxlint-disable-next-line typescript/no-unnecessary-condition
    if (stopped) break
    if (!matches.length) continue

    if (o.throttle) {
      const now = performance.now()
      if (now - lastYield >= o.throttle) {
        lastYield = now
        yield matches.splice(0) // yield and clear matches
      }
    } else yield* matches.splice(0) // yield and clear matches
  }

  o.signal?.throwIfAborted()
  if (matches.length === 0) return
  if (o.throttle)
    yield matches.splice(0) // yield and clear matches
  else yield* matches.splice(0) // yield and clear matches
}
