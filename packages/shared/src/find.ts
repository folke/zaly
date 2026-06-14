import type { GlobOptions } from "./glob.ts"

import { basename, relative } from "pathe"
import { normPath } from "./path.ts"
import { Spawn } from "./process/spawn.ts"
import { TextStream } from "./process/stream.ts"
import { which } from "./process/system.ts"

export type FindOptions = {
  backend?: "fd" | "rg" | "glob"
  cwd?: string
  depth?: number
  exclude?: string[]
  follow?: boolean
  hidden?: boolean
  ignore?: boolean
  limit?: number
  paths?: string[]
  pattern?: string | string[]
  signal?: AbortSignal
  type?: "file" | "dir" | "any"
  throttle?: number
}

const defaults: FindOptions = {
  depth: Infinity,
  exclude: [],
  follow: false,
  hidden: false,
  ignore: true,
  limit: undefined,
  paths: [],
  pattern: undefined,
  throttle: 16,
  type: "file",
}

export const DEFAULT_SEARCH_EXCLUDES = [
  ".git",
  ".bare",
  "node_modules",
  ".node_modules",
  "dist",
  "build",
  "coverage",
  ".next",
  ".nuxt",
  ".svelte-kit",
  ".vitepress/dist",
  ".cache",
  ".turbo",
] as const

export class FindError extends Error {
  readonly code: string
  readonly data?: unknown
  readonly retryable?: boolean

  constructor(opts: { message: string; code: string; cause?: unknown; data?: unknown }) {
    super(opts.message, { cause: opts.cause })
    this.name = "FindError"
    this.code = opts.code
    this.data = opts.data
  }
}

type Finder = (opts: FindOptions) => AsyncIterable<string[]>

const backends: Record<NonNullable<FindOptions["backend"]>, Finder> = {
  async *fd(opts: FindOptions) {
    if (which("fd")) yield* spawnFind("fd", fdArgs(opts), opts)
    else if (which("fdfind")) yield* spawnFind("fdfind", fdArgs(opts), opts)
    else throw new FindError({ code: "FIND_UNAVAILABLE", message: "fd/fdfind not found" })
  },
  async *glob(opts: FindOptions) {
    const { glob } = await import("./glob.ts")
    const cwd = normPath(opts.cwd)
    const paths = (opts.paths ?? []).map((p) => normPath(cwd, p))
    const exclude = [...defaultExcludes(opts.paths ?? []), ...(opts.exclude ?? [])]
    const globOpts: Partial<GlobOptions> = {
      ...opts,
      exclude,
      type: opts.type === "any" ? undefined : opts.type,
    }
    let count = 0
    if (paths.length === 0) paths.push(cwd)
    for (const path of paths) {
      if (opts.signal?.aborted) return
      const rel = relative(cwd, path)
      // oxlint-disable-next-line no-await-in-loop
      for await (const p of glob(opts.pattern, { ...globOpts, cwd: path })) {
        yield p.map((f) => (rel ? `${rel}/${f}` : f))
        count += p.length
        if (opts.limit && count >= opts.limit) return
      }
    }
  },
  async *rg(opts: FindOptions) {
    if (which("rg")) yield* spawnFind("rg", rgFilesArgs(opts), opts)
    else throw new FindError({ code: "FIND_UNAVAILABLE", message: "rg not found" })
  },
}

export function defaultExcludes(paths: readonly string[]): string[] {
  return DEFAULT_SEARCH_EXCLUDES.filter(
    (exclude) => !paths.some((p) => explicitlyTargets(p, exclude))
  )
}

export async function* find(opts: FindOptions = {}): AsyncIterable<string[]> {
  opts = { ...defaults, ...opts }
  if (opts.signal?.aborted) return
  let backend = opts.backend
  if (!backend) {
    if (which("fd") || which("fdfind")) backend = "fd"
    else if (opts.type === "file" && which("rg")) backend = "rg"
    else backend = "glob"
  }
  const finder = backends[backend]
  const throttle = opts.throttle ?? 16
  let lastYield = performance.now()
  for await (const f of finder(opts)) {
    const now = performance.now()
    if (now - lastYield >= throttle) {
      lastYield = now
      await new Promise((r) => setImmediate(r))
      if (opts.signal?.aborted) return
    }
    yield f
  }
}

async function* spawnFind(cmd: string, args: string[], opts: FindOptions): AsyncIterable<string[]> {
  const cwd = normPath(opts.cwd)
  const stdout = new TextStream()
  const stderr = new TextStream()
  const proc = new Spawn(cmd, args, {
    cwd,
    signal: opts.signal,
    stderr,
    stdout,
    timeout: 60_000,
  })

  let count = 0
  let stoppedEarly = false

  try {
    for await (const batch of stdout.lineBatches(1024)) {
      if (opts.signal?.aborted) {
        stoppedEarly = true
        proc.abort()
        break
      }

      yield batch

      if (opts.limit && ++count >= opts.limit) {
        stoppedEarly = true
        proc.abort()
        break
      }
    }

    const result = await proc.result.catch((error: unknown) => {
      throw new FindError({ cause: error, code: "FIND_FAILED", message: String(error) })
    })

    if (!stoppedEarly && result.code !== 0) {
      throw new FindError({
        code: "FIND_FAILED",
        data: { code: result.code, stderr: result.stderr },
        message: `${cmd} failed (${result.code}): ${result.stderr.slice(0, 500)}`,
      })
    }
  } finally {
    if (!proc.done) proc.abort()
  }
}

function fdArgs(opts: FindOptions): string[] {
  const globs = normalizeGlobs(opts.pattern)
  const ret = ["--color", "never"]
  const paths = opts.paths ?? []
  if (opts.limit) ret.push("--max-results", String(opts.limit))
  if (opts.type === "file") ret.push("--type", "file", "--type", "symlink")
  else if (opts.type === "dir") ret.push("--type", "directory")
  if (opts.depth !== undefined && opts.depth !== Infinity)
    ret.push("--max-depth", String(opts.depth))
  if (opts.hidden) ret.push("--hidden")
  if (!opts.ignore) ret.push("--no-ignore")
  if (opts.follow) ret.push("--follow")
  for (const e of [...defaultExcludes(paths), ...(opts.exclude ?? [])]) ret.push("--exclude", e)
  ret.push("--glob", fdGlob(globs), ...paths)
  return ret
}

function rgFilesArgs(opts: FindOptions): string[] {
  const globs = normalizeGlobs(opts.pattern)
  const ret = ["--files", "--no-messages", "--color", "never"]
  if (opts.hidden) ret.push("--hidden")
  if (!opts.ignore) ret.push("--no-ignore")
  if (opts.follow) ret.push("--follow")
  const paths = opts.paths ?? []
  for (const e of [...defaultExcludes(paths), ...(opts.exclude ?? [])]) ret.push("--glob", `!${e}`)
  for (const glob of globs) ret.push("--glob", glob)
  ret.push(...paths)
  return ret
}

function normalizeGlobs(glob: string | string[] | undefined): string[] {
  const values = Array.isArray(glob) ? glob : [glob]
  return values
    .map((value) => value?.trim())
    .filter(
      (value): value is string => !!value && value !== "." && value !== "*" && value !== "**/*"
    )
    .map((value) => (hasGlob(value) ? value : `*${value}*`))
}

function fdGlob(globs: string[]): string {
  if (globs.length === 0) return "*"
  if (globs.length === 1) return globs[0]
  return `{${globs.join(",")}}`
}

function hasGlob(pattern: string): boolean {
  return /[*?[{]/.test(pattern)
}

function explicitlyTargets(path: string, exclude: string): boolean {
  const abs = normPath(path)
  const base = basename(abs)
  return base === exclude || abs.endsWith(`/${exclude}`) || abs.includes(`/${exclude}/`)
}
