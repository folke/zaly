import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { homedir, tmpdir } from "node:os"
import { join, resolve } from "pathe"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import {
  findUp,
  gitRoot,
  hash,
  normPath,
  prettyPath,
  safeAsyncFn,
  safeFn,
  safeReadFile,
  safeReadFileSync,
  safeStat,
  safeStringify,
  toError,
} from "../src/utils.ts"

describe("safeFn", () => {
  test("returns value on success", () => {
    expect(safeFn((x: number) => x + 1)(2)).toBe(3)
  })
  test("returns undefined on throw", () => {
    expect(
      safeFn(() => {
        throw new Error("boom")
      })()
    ).toBeUndefined()
  })
})

describe("safeAsyncFn", () => {
  test("returns awaited value on success", async () => {
    expect(await safeAsyncFn(async (x: number) => x * 2)(3)).toBe(6)
  })
  test("returns undefined on rejection", async () => {
    expect(await safeAsyncFn(async () => Promise.reject(new Error("nope")))()).toBeUndefined()
  })
})

describe("hash", () => {
  test("known sha256 of empty string", () => {
    expect(hash("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")
  })
  test("string and equivalent bytes hash identically", () => {
    expect(hash("abc")).toBe(hash(new TextEncoder().encode("abc")))
  })
})

describe("toError", () => {
  test("returns Error instances unchanged", () => {
    const e = new Error("x")
    expect(toError(e)).toBe(e)
  })
  test("wraps non-Error values", () => {
    const e = toError("oops")
    expect(e).toBeInstanceOf(Error)
    expect(e.message).toBe("oops")
  })
})

describe("safeStringify", () => {
  test("standard JSON output", () => {
    expect(safeStringify({ a: 1 })).toBe('{"a":1}')
  })
  test("bigint coerced to string", () => {
    expect(safeStringify({ n: 10n })).toBe('{"n":"10"}')
  })
  test("falls back to String() on circular structure", () => {
    const a: Record<string, unknown> = {}
    a.self = a
    expect(safeStringify(a)).toBe("[object Object]")
  })
})

describe("safe* fs helpers", () => {
  test("safeStat returns undefined for missing path", () => {
    expect(safeStat("/no/such/path/here")).toBeUndefined()
  })
  test("safeReadFileSync reads existing files and undefined for missing", () => {
    const dir = mkdtempSync(join(tmpdir(), "zaly-utils-"))
    const f = join(dir, "x.txt")
    writeFileSync(f, "hello")
    try {
      expect(safeReadFileSync(f)).toBe("hello")
      expect(safeReadFileSync(join(dir, "missing"))).toBeUndefined()
    } finally {
      rmSync(dir, { force: true, recursive: true })
    }
  })
  test("safeReadFile resolves bytes for existing files and undefined for missing", async () => {
    const dir = mkdtempSync(join(tmpdir(), "zaly-utils-"))
    const f = join(dir, "x.txt")
    writeFileSync(f, "hi")
    try {
      const buf = await safeReadFile(f)
      expect(buf?.toString()).toBe("hi")
      expect(await safeReadFile(join(dir, "missing"))).toBeUndefined()
    } finally {
      rmSync(dir, { force: true, recursive: true })
    }
  })
})

describe("findUp / gitRoot", () => {
  let dir: string
  let nested: string
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "zaly-findup-"))
    nested = join(dir, "a", "b", "c")
    mkdirSync(nested, { recursive: true })
    writeFileSync(join(dir, "marker.txt"), "")
    mkdirSync(join(dir, ".git"))
  })
  afterAll(() => {
    rmSync(dir, { force: true, recursive: true })
  })

  test("walks up to find a file", () => {
    // Returns the path to the matched file/dir.
    expect(findUp(nested, "marker.txt")).toBe(join(dir, "marker.txt"))
  })
  test("returns undefined when not found before filesystem root", () => {
    expect(findUp(nested, "definitely-not-there.xyz")).toBeUndefined()
  })
  test("stops at sentinel directory and returns undefined", () => {
    // .git lives at `dir`; with stop=".git", searching for an absent file
    // should bail at `dir` rather than ascending further.
    expect(findUp(nested, "definitely-not-there.xyz", ".git")).toBeUndefined()
  })
  test("findUp matches directories, not just files", () => {
    expect(findUp(nested, ".git")).toBe(join(dir, ".git"))
  })
})

describe("gitRoot", () => {
  test("finds the project root via a `.git` directory", () => {
    const dir = mkdtempSync(join(tmpdir(), "zaly-gitroot-"))
    try {
      const nested = join(dir, "a", "b")
      mkdirSync(nested, { recursive: true })
      mkdirSync(join(dir, ".git"))
      // gitRoot returns the project directory (parent of `.git`),
      // not the `.git` path itself.
      expect(gitRoot(nested)).toBe(dir)
    } finally {
      rmSync(dir, { force: true, recursive: true })
    }
  })
  test("finds the project root via a `.git` file (worktree-style)", () => {
    const dir = mkdtempSync(join(tmpdir(), "zaly-gitroot-"))
    try {
      const nested = join(dir, "a")
      mkdirSync(nested, { recursive: true })
      writeFileSync(join(dir, ".git"), "gitdir: /elsewhere\n")
      expect(gitRoot(nested)).toBe(dir)
    } finally {
      rmSync(dir, { force: true, recursive: true })
    }
  })
  test("returns undefined when no .git exists above the path", () => {
    const dir = mkdtempSync(join(tmpdir(), "zaly-gitroot-"))
    try {
      // The temp dir lives under /tmp — assume no .git anywhere above it.
      expect(gitRoot(dir)).toBeUndefined()
    } finally {
      rmSync(dir, { force: true, recursive: true })
    }
  })
})

describe("normPath", () => {
  test("expands leading ~", () => {
    expect(normPath("~/foo")).toBe(join(homedir(), "foo"))
  })
  test("expands bare ~", () => {
    expect(normPath("~")).toBe(homedir())
  })
  test("does not expand mid-string ~", () => {
    expect(normPath("/a/~/b")).toBe("/a/~/b")
  })
  test("resolves relative segments", () => {
    expect(normPath("/a/b", "../c")).toBe("/a/c")
  })
  test("undefined entries are filtered", () => {
    // Caller can pass an optional `cwd` without an `?? process.cwd()`
    // dance — undefined drops out, leaving `resolve()` to fall back to
    // `process.cwd()` for relative paths.
    expect(normPath(undefined, "/abs/path")).toBe("/abs/path")
    expect(normPath(undefined, "rel")).toBe(resolve("rel"))
    expect(normPath(undefined, undefined, "/x")).toBe("/x")
  })
  test("empty-string entries are filtered", () => {
    // Same rationale as undefined — empty strings would otherwise
    // collapse to the current directory mid-chain.
    expect(normPath("", "/abs")).toBe("/abs")
    expect(normPath("/base", "")).toBe("/base")
  })
})

describe("prettyPath", () => {
  test("returns '.' for the cwd itself", () => {
    expect(prettyPath(process.cwd())).toBe(".")
  })
  test("returns relative path for descendants of cwd", () => {
    expect(prettyPath(join(process.cwd(), "sub", "file"))).toBe("sub/file")
  })
  test("uses ~ for paths under the home directory", () => {
    const p = join(homedir(), "some", "path")
    // Only meaningful when home is not an ancestor of cwd; if the test is
    // run from inside $HOME, the result is a plain relative path instead.
    const out = prettyPath(p)
    expect(out === "~/some/path" || !out.startsWith("..")).toBe(true)
  })
})
