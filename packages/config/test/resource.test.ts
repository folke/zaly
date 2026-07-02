import type { ConfigFile } from "../src/config.ts"
import type { Config, ConfigScope } from "../src/types.ts"

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterEach, describe, expect, test, vi } from "vitest"
import { ResourceManager } from "../src/resource/manager.ts"
import { ResourceMatcher, ResourcePack } from "../src/resource/resource.ts"

let dirs: string[] = []
afterEach(() => {
  for (const dir of dirs) rmSync(dir, { force: true, recursive: true })
  dirs = []
})

function tmp() {
  const dir = mkdtempSync(join(tmpdir(), "zaly-config-resource-"))
  dirs.push(dir)
  return dir
}

function touch(path: string) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, "x")
}

function config(dir: string, scope: ConfigScope, settings: Config = {}) {
  const set = vi.fn(async (path: string[], value: unknown) => {
    let target = settings as Record<string, unknown>
    for (const key of path.slice(0, -1)) {
      target[key] ??= {}
      target = target[key] as Record<string, unknown>
    }
    target[path.at(-1)!] = value
  })
  return {
    $: settings,
    $set: set,
    dir,
    paths: { data: join(dir, ".data") },
    scope,
    set,
  } as unknown as ConfigFile & { $set: typeof set }
}

describe("ResourceMatcher", () => {
  test("matches enabled resources under the pack dir with include/exclude filters", () => {
    const dir = join(tmp(), "pack")
    const matcher = new ResourceMatcher(dir, {
      exclude: ["skills/disabled/**", "themes"],
      include: ["skills", "commands/*.md"],
    })

    expect(matcher.enabled).toBe(true)
    expect(matcher.use("skills")).toBe(true)
    expect(matcher.use("themes")).toBe(false)
    expect(matcher.match(join(dir, "skills/demo/SKILL.md"))).toBe(true)
    expect(matcher.match(join(dir, "skills/disabled/SKILL.md"))).toBe(false)
    expect(matcher.match(join(dir, "commands/run.md"))).toBe(true)
    expect(matcher.match(join(dir, "plugins/index.ts"))).toBe(false)
    expect(matcher.match(join(tmp(), "other/skills/SKILL.md"))).toBe(false)
  })

  test("disabled matcher rejects every type and path", () => {
    const matcher = new ResourceMatcher(tmp(), { enabled: false })
    expect(matcher.enabled).toBe(false)
    expect(matcher.use("skills")).toBe(false)
    expect(matcher.match(join(tmp(), "skills/SKILL.md"))).toBe(false)
  })
})

describe("ResourcePack", () => {
  test("discovers resources lazily, caches results, and refreshes state", async () => {
    const dir = tmp()
    touch(join(dir, "skills/demo/SKILL.md"))
    touch(join(dir, "commands/run.md"))
    touch(join(dir, "plugins/index.ts"))
    touch(join(dir, "themes/moon.json"))
    const pack = new ResourcePack(dir, config(dir, "project"))

    expect(pack.id).toBe(".")
    expect(pack.scope).toBe("project")
    expect(pack.enabled).toBe(true)
    expect(pack.isPlugin()).toBe(false)
    await expect(pack.exists()).resolves.toBe(true)
    await expect(pack.skills()).resolves.toEqual([join(dir, "skills/demo/SKILL.md")])
    await expect(pack.commands()).resolves.toEqual([join(dir, "commands/run.md")])
    await expect(pack.plugins()).resolves.toEqual([join(dir, "plugins/index.ts")])
    await expect(pack.themes()).resolves.toEqual([join(dir, "themes/moon.json")])

    touch(join(dir, "commands/second.md"))
    await expect(pack.commands()).resolves.toEqual([join(dir, "commands/run.md")])
    pack.refresh()
    await expect(pack.commands()).resolves.toEqual([join(dir, "commands/run.md")])
  })

  test("applies filters, disabled resource types, plugin ids, and all() visibility", async () => {
    const root = tmp()
    const dir = join(root, "plugin")
    touch(join(dir, "skills/enabled/SKILL.md"))
    touch(join(dir, "skills/disabled/SKILL.md"))
    touch(join(dir, "commands/run.md"))
    const cfg = config(root, "user", {
      resources: {
        "npm:@scope/demo": { exclude: ["skills/disabled/**"], include: ["skills"] },
      },
    })
    const pack = new ResourcePack(
      {
        dir,
        name: "@scope/demo",
        scope: "user",
        store: join(root, "packs/npm"),
        type: "npm",
        uri: "npm:@scope/demo",
      },
      cfg,
      { disabled: ["commands"] }
    )

    expect(pack.id).toBe("npm:@scope/demo")
    expect(pack.plugin?.type).toBe("npm")
    expect(pack.isPlugin()).toBe(true)
    await expect(pack.commands()).resolves.toEqual([])
    await expect(pack.skills()).resolves.toEqual([join(dir, "skills/enabled/SKILL.md")])
    await expect(pack.all("skills")).resolves.toEqual(
      new Map([
        [join(dir, "skills/disabled/SKILL.md"), false],
        [join(dir, "skills/enabled/SKILL.md"), true],
      ])
    )

    await pack.updateFilter({ enabled: false })
    expect(cfg.$set).toHaveBeenCalledWith(["resources", "npm:@scope/demo"], { enabled: false })
    expect(pack.enabled).toBe(false)
    await expect(new ResourcePack(pack.plugin!, cfg).skills()).resolves.toEqual([])
  })

  test("missing pack directories return no resources", async () => {
    const dir = join(tmp(), "missing")
    const pack = new ResourcePack(dir, config(tmp(), "project"))
    await expect(pack.exists()).resolves.toBe(false)
    await expect(pack.skills()).resolves.toEqual([])
  })
})

describe("ResourceManager", () => {
  test("builds packs by precedence and filters disabled types/scopes/plugins", async () => {
    const root = tmp()
    const projectDir = join(root, "project/.zaly")
    const userDir = join(root, "user/.zaly")
    const dotAgents = join(root, "project/.agents")
    touch(join(projectDir, "skills/project/SKILL.md"))
    touch(join(userDir, "commands/user.md"))
    touch(join(dotAgents, "skills/agent/SKILL.md"))

    const manager = new ResourceManager(
      {
        paths: { dotAgents: [dotAgents] },
        project: config(projectDir, "project"),
        user: config(userDir, "user"),
        workspace: undefined,
      } as never,
      { disabled: ["themes"], logger: undefined as never }
    )

    expect(manager.list().map((pack) => pack.scope)).toEqual(["project", "project", "user", "user"])
    expect(manager.list({ scope: "project" })).toHaveLength(2)
    expect(manager.list({ plugin: true })).toHaveLength(0)
    await expect(manager.get("skills", "project")).resolves.toEqual([
      join(projectDir, "skills/project/SKILL.md"),
      join(dotAgents, "skills/agent/SKILL.md"),
    ])
    await expect(manager.commands()).resolves.toEqual([join(userDir, "commands/user.md")])
    await expect(manager.themes()).resolves.toEqual([])
  })
})
