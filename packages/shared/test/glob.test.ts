import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "pathe"
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest"
import { glob } from "../src/glob.ts"

/** Collect a glob into a sorted array — most assertions compare unordered. */
async function collect(...args: Parameters<typeof glob>): Promise<string[]> {
  const out: string[] = []
  for await (const m of glob(...args)) out.push(m)
  return out.toSorted()
}

describe("glob", () => {
  let root: string

  beforeAll(() => {
    // Layout:
    //   root/
    //     README.md
    //     package.json
    //     visible.txt
    //     .hidden          (dot file)
    //     .gitignore       ("ignored.txt")
    //     ignored.txt      (matched by root .gitignore)
    //     src/
    //       index.ts
    //       util.ts
    //       nested/
    //         deep.ts
    //         README.md
    //     sub/
    //       .gitignore     ("*.log")
    //       file.log       (matched by sub .gitignore)
    //       file.txt
    //     .git/
    //       config         (dot dir — excluded by default)
    //     node_modules/
    //       pkg/
    //         index.js     (dir excluded by default)
    //     empty/
    root = mkdtempSync(join(tmpdir(), "zaly-glob-"))

    writeFileSync(join(root, "README.md"), "")
    writeFileSync(join(root, "package.json"), "{}")
    writeFileSync(join(root, "visible.txt"), "")
    writeFileSync(join(root, ".hidden"), "")
    writeFileSync(join(root, ".gitignore"), "ignored.txt\n")
    writeFileSync(join(root, "ignored.txt"), "")

    mkdirSync(join(root, "src"))
    writeFileSync(join(root, "src", "index.ts"), "")
    writeFileSync(join(root, "src", "util.ts"), "")
    mkdirSync(join(root, "src", "nested"))
    writeFileSync(join(root, "src", "nested", "deep.ts"), "")
    writeFileSync(join(root, "src", "nested", "README.md"), "")

    mkdirSync(join(root, "sub"))
    writeFileSync(join(root, "sub", ".gitignore"), "*.log\n")
    writeFileSync(join(root, "sub", "file.log"), "")
    writeFileSync(join(root, "sub", "file.txt"), "")

    mkdirSync(join(root, ".git"))
    writeFileSync(join(root, ".git", "config"), "")

    mkdirSync(join(root, "node_modules"))
    mkdirSync(join(root, "node_modules", "pkg"))
    writeFileSync(join(root, "node_modules", "pkg", "index.js"), "")

    mkdirSync(join(root, "empty"))
  })

  afterAll(() => {
    rmSync(root, { force: true, recursive: true })
  })

  describe("basic patterns", () => {
    test("`*.md` matches only top-level .md files (no recursion)", async () => {
      expect(await collect("*.md", { cwd: root })).toEqual(["README.md"])
    })

    test("`**/*.md` matches at any depth", async () => {
      expect(await collect("**/*.md", { cwd: root })).toEqual([
        "README.md",
        "src/nested/README.md",
      ])
    })

    test("`**/*.ts` matches all TypeScript files", async () => {
      expect(await collect("**/*.ts", { cwd: root })).toEqual([
        "src/index.ts",
        "src/nested/deep.ts",
        "src/util.ts",
      ])
    })

    test("literal pattern matches a single file", async () => {
      expect(await collect("package.json", { cwd: root })).toEqual(["package.json"])
    })

    test("non-matching pattern returns empty", async () => {
      expect(await collect("*.does-not-exist", { cwd: root })).toEqual([])
    })
  })

  describe("multiple patterns", () => {
    test("OR semantics across an array of patterns", async () => {
      expect(await collect(["*.md", "*.json"], { cwd: root })).toEqual([
        "README.md",
        "package.json",
      ])
    })
  })

  describe("type filter", () => {
    test("default type is 'file' (dirs excluded)", async () => {
      const result = await collect("**/*", { cwd: root, ignore: false, hidden: true })
      expect(result).not.toContain("src/")
      expect(result).not.toContain("sub/")
    })

    test("`type: 'dir'` returns only directories", async () => {
      const result = await collect("**/*", { cwd: root, type: "dir", ignore: false, hidden: true })
      // All returned entries should end with /
      for (const r of result) expect(r.endsWith("/")).toBe(true)
      expect(result).toContain("src/")
      expect(result).toContain("sub/")
      expect(result).toContain("empty/")
    })

    test("`type: undefined` returns both files and directories", async () => {
      const result = await collect("**/*", {
        cwd: root,
        type: undefined,
        ignore: false,
        hidden: true,
      })
      // Mix of files (no trailing /) and dirs (trailing /).
      const files = result.filter((r) => !r.endsWith("/"))
      const dirs = result.filter((r) => r.endsWith("/"))
      expect(files.length).toBeGreaterThan(0)
      expect(dirs.length).toBeGreaterThan(0)
    })
  })

  describe("ignore files (.gitignore cascade)", () => {
    test("respects root .gitignore by default", async () => {
      const result = await collect("**/*.txt", { cwd: root })
      expect(result).not.toContain("ignored.txt")
      expect(result).toContain("visible.txt")
    })

    test("nested .gitignore applies to its subtree", async () => {
      const result = await collect("**/*", { cwd: root })
      expect(result).not.toContain("sub/file.log")
      expect(result).toContain("sub/file.txt")
    })

    test("`ignore: false` disables ignore-file processing", async () => {
      const result = await collect("**/*.txt", { cwd: root, ignore: false })
      expect(result).toContain("ignored.txt")
      expect(result).toContain("visible.txt")
    })
  })

  describe("hidden files", () => {
    test("`hidden: false` (default) skips dotfiles", async () => {
      const result = await collect("**/*", { cwd: root })
      expect(result).not.toContain(".hidden")
    })

    test("`hidden: true` includes dotfiles", async () => {
      const result = await collect("**/*", { cwd: root, hidden: true })
      expect(result).toContain(".hidden")
    })
  })

  describe("exclude option", () => {
    test("default exclude prunes `.git` and `node_modules/`", async () => {
      const result = await collect("**/*", { cwd: root, hidden: true })
      expect(result.some((r) => r.startsWith(".git"))).toBe(false)
      expect(result.some((r) => r.startsWith("node_modules"))).toBe(false)
    })

    test("custom exclude prunes named subtree", async () => {
      const result = await collect("**/*.ts", {
        cwd: root,
        exclude: ["src/nested/"],
      })
      expect(result).toContain("src/index.ts")
      expect(result).toContain("src/util.ts")
      expect(result).not.toContain("src/nested/deep.ts")
    })

    test("empty exclude with hidden:true and ignore:false walks everything visible", async () => {
      const result = await collect("**/*", {
        cwd: root,
        exclude: [],
        hidden: true,
        ignore: false,
      })
      expect(result).toContain("node_modules/pkg/index.js")
      expect(result).toContain(".git/config")
      expect(result).toContain(".hidden")
    })
  })

  describe("depth limit", () => {
    test("`depth: 1` only matches at the top level", async () => {
      const result = await collect("**/*", { cwd: root, depth: 1 })
      expect(result).toContain("README.md")
      expect(result).not.toContain("src/index.ts") // depth 2
    })

    test("`depth: 0` scans cwd but doesn't descend", async () => {
      const result = await collect("**/*", { cwd: root, depth: 0 })
      expect(result).toContain("README.md")
      expect(result).toContain("package.json")
      expect(result).not.toContain("src/index.ts")
      expect(result).not.toContain("sub/file.txt")
    })
  })

  describe("pattern depth pruning", () => {
    test("`*.md` doesn't recurse into subdirs (only root)", async () => {
      const onVisit = vi.fn()
      await collect("*.md", { cwd: root, onVisit })
      // onVisit should have visited root-level entries only, not subdirs of src/ etc.
      const visited = onVisit.mock.calls.map((c) => c[0] as string)
      // src/index.ts is at depth 2; visiting it would mean we descended into src/
      expect(visited).not.toContain("src/index.ts")
    })

    test("`**/*.md` recurses into subdirs", async () => {
      const onVisit = vi.fn()
      await collect("**/*.md", { cwd: root, onVisit })
      const visited = onVisit.mock.calls.map((c) => c[0] as string)
      expect(visited).toContain("src/nested/README.md")
    })
  })

  describe("callbacks", () => {
    test("onMatch fires for each match", async () => {
      const onMatch = vi.fn()
      await collect("*.md", { cwd: root, onMatch })
      expect(onMatch).toHaveBeenCalledWith("README.md")
    })

    test("onVisit fires for every entry encountered", async () => {
      const onVisit = vi.fn()
      await collect("*.md", { cwd: root, onVisit })
      // visited includes both matches and non-matches at the same level
      const visited = onVisit.mock.calls.map((c) => c[0] as string)
      expect(visited).toContain("README.md")
      expect(visited).toContain("visible.txt") // non-match at root
    })

    test("onError fires for unreadable directory", async () => {
      const onError = vi.fn()
      const result = await collect("**/*", {
        cwd: join(root, "does-not-exist"),
        onError,
      })
      expect(onError).toHaveBeenCalled()
      expect(result).toEqual([])
    })
  })

  describe("abort signal", () => {
    test("pre-aborted signal causes throw before any walk", async () => {
      const ac = new AbortController()
      ac.abort()
      await expect(collect("**/*", { cwd: root, signal: ac.signal })).rejects.toThrow()
    })

    test("signal aborted mid-walk causes throw", async () => {
      const ac = new AbortController()
      const onVisit = vi.fn(() => {
        ac.abort() // abort on first visit
      })
      await expect(
        collect("**/*", { cwd: root, signal: ac.signal, onVisit, hidden: true })
      ).rejects.toThrow()
    })
  })

  describe("symlinks", () => {
    let symRoot: string
    beforeAll(() => {
      symRoot = mkdtempSync(join(tmpdir(), "zaly-glob-sym-"))
      mkdirSync(join(symRoot, "real"))
      writeFileSync(join(symRoot, "real", "target.txt"), "")
      try {
        symlinkSync(join(symRoot, "real"), join(symRoot, "link"))
      } catch {
        // Symlinks may not be supported on this platform — tests below will skip.
      }
    })
    afterAll(() => {
      rmSync(symRoot, { force: true, recursive: true })
    })

    test("`follow: false` (default) doesn't traverse symlinked dirs", async () => {
      const result = await collect("**/*.txt", { cwd: symRoot })
      expect(result).toContain("real/target.txt")
      expect(result).not.toContain("link/target.txt")
    })

    test("`follow: true` traverses symlinked dirs", async () => {
      const result = await collect("**/*.txt", { cwd: symRoot, follow: true })
      expect(result).toContain("real/target.txt")
      expect(result).toContain("link/target.txt")
    })
  })

  describe("edge cases", () => {
    test("nonexistent cwd returns empty (with onError suppressing)", async () => {
      const result = await collect("**/*", {
        cwd: join(root, "does-not-exist"),
        onError: () => {},
      })
      expect(result).toEqual([])
    })

    test("empty directory returns no matches", async () => {
      const result = await collect("**/*", { cwd: join(root, "empty") })
      expect(result).toEqual([])
    })

    test("nested **/SKILL.md style pattern", async () => {
      // Use README.md as a stand-in for SKILL.md
      const result = await collect("**/README.md", { cwd: root })
      expect(result).toContain("README.md")
      expect(result).toContain("src/nested/README.md")
    })
  })
})
