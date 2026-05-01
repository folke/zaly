import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "pathe"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { findResource } from "../src/utils/resource.ts"

let root: string
let parent: string

beforeEach(() => {
  // `parent` wraps everything so cleanup catches stray files we drop
  // *above* the git root in walk-boundary tests.
  parent = mkdtempSync(join(tmpdir(), "zaly-resource-"))
  root = join(parent, "repo")
  // Mark `root` as a git project so the walk stops at this boundary
  // instead of climbing all the way to the filesystem root.
  mkdirSync(join(root, ".git"), { recursive: true })
})
afterEach(() => {
  rmSync(parent, { force: true, recursive: true })
})

const mkfile = (path: string, content = "x"): string => {
  mkdirSync(join(path, ".."), { recursive: true })
  writeFileSync(path, content)
  return path
}
const mkdir = (path: string): string => {
  mkdirSync(path, { recursive: true })
  return path
}

/** Run `findResource` with `$HOME` redirected to a tmp subdir so
 *  user-scope lookup hits files we control rather than the developer's
 *  real `~/.agents/`. */
function withHome<T>(home: string, fn: () => T): T {
  const before = process.env.HOME
  process.env.HOME = home
  try {
    return fn()
  } finally {
    if (before === undefined) delete process.env.HOME
    else process.env.HOME = before
  }
}

describe("findResource", () => {
  test("returns empty array when nothing matches", () => {
    expect(findResource({ cwd: root, rel: "AGENTS.md", scopes: ["project"] })).toEqual([])
  })

  test("project scope finds resource at cwd", () => {
    const path = mkfile(join(root, "AGENTS.md"))
    const result = findResource({ cwd: root, rel: "AGENTS.md", scopes: ["project"] })
    expect(result).toEqual([{ path, scope: "project" }])
  })

  test("agent scope finds resource under .agents/", () => {
    const path = mkfile(join(root, ".agents", "AGENTS.md"))
    const result = findResource({ cwd: root, rel: "AGENTS.md", scopes: ["agent"] })
    expect(result).toEqual([{ path, scope: "agent" }])
  })

  test("walks up from a deeper cwd to the git root", () => {
    const path = mkfile(join(root, "AGENTS.md"))
    const deep = mkdir(join(root, "src", "nested", "deep"))
    const result = findResource({ cwd: deep, rel: "AGENTS.md", scopes: ["project"] })
    // `[{path, scope: project}]` — found at git root, walked up from deep.
    expect(result).toEqual([{ path, scope: "project" }])
  })

  test("collects resources at every level walking up", () => {
    const rootPath = mkfile(join(root, "AGENTS.md"), "root")
    const midPath = mkfile(join(root, "pkg", "AGENTS.md"), "mid")
    const cwd = mkdir(join(root, "pkg", "src"))
    const result = findResource({ cwd, rel: "AGENTS.md", scopes: ["project"] })
    // `toReversed()` puts the most-specific match LAST so callers that
    // pick `at(-1)` get "project shadows root".
    expect(result.map((r) => r.path)).toEqual([rootPath, midPath])
  })

  test("user scope reads from `$HOME/.agents/<rel>` (HOME-override aware)", () => {
    const home = mkdir(join(root, "fake-home"))
    const path = mkfile(join(home, ".agents", "AGENTS.md"))
    const result = withHome(home, () =>
      findResource({ cwd: root, rel: "AGENTS.md", scopes: ["user"] })
    )
    expect(result).toEqual([{ path, scope: "user" }])
  })

  test("combined scopes: user + project, returned with user first then project last", () => {
    const home = mkdir(join(root, "fake-home"))
    const userPath = mkfile(join(home, ".agents", "AGENTS.md"), "user")
    const projectPath = mkfile(join(root, "AGENTS.md"), "project")
    const result = withHome(home, () =>
      findResource({ cwd: root, rel: "AGENTS.md", scopes: ["user", "project"] })
    )
    // After `toReversed`, user comes first, project last (most specific
    // wins for `at(-1)` consumers).
    expect(result).toEqual([
      { path: userPath, scope: "user" },
      { path: projectPath, scope: "project" },
    ])
  })

  test("type: 'dir' filters out file matches", () => {
    mkfile(join(root, "skills"))
    expect(
      findResource({ cwd: root, rel: "skills", scopes: ["project"], type: "dir" })
    ).toEqual([])
  })

  test("type: 'file' filters out dir matches", () => {
    mkdir(join(root, "skills"))
    expect(
      findResource({ cwd: root, rel: "skills", scopes: ["project"], type: "file" })
    ).toEqual([])
  })

  test("type: 'dir' accepts directories", () => {
    const path = mkdir(join(root, "skills"))
    const result = findResource({ cwd: root, rel: "skills", scopes: ["project"], type: "dir" })
    expect(result).toEqual([{ path, scope: "project" }])
  })

  test("agent + project scopes both fire when both paths exist", () => {
    const projectPath = mkfile(join(root, "AGENTS.md"), "p")
    const agentPath = mkfile(join(root, ".agents", "AGENTS.md"), "a")
    const result = findResource({
      cwd: root,
      rel: "AGENTS.md",
      scopes: ["agent", "project"],
    })
    // After reverse, the agent one comes last (was pushed first since
    // `agent` is checked first in the inner loop).
    expect(result.map((r) => ({ path: r.path, scope: r.scope }))).toEqual([
      { path: projectPath, scope: "project" },
      { path: agentPath, scope: "agent" },
    ])
  })

  test("does not climb past the git root", () => {
    // File exists ABOVE the git root (in `parent`) — must not be found.
    mkfile(join(parent, "AGENTS.md"), "stray")
    expect(findResource({ cwd: root, rel: "AGENTS.md", scopes: ["project"] })).toEqual([])
  })
})
