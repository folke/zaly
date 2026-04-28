import type { PermissionHandler } from "../src/permissions/types.ts"

import { describe, expect, test } from "vitest"
import { parseRules, PermissionManager } from "../src/permissions/manager.ts"

const cwd = "/home/folke/projects/zaly"

describe("PermissionManager — workspaces", () => {
  test("auto-includes cwd as the first workspace", () => {
    const m = new PermissionManager({ cwd })
    expect(m.workspaces[0]).toBe(cwd)
  })

  test("does not duplicate cwd when passed explicitly", () => {
    const m = new PermissionManager({ cwd, workspaces: [cwd] })
    expect(m.workspaces.filter((w) => w === cwd)).toHaveLength(1)
  })

  test("addWorkspace resolves relative paths against cwd", () => {
    const m = new PermissionManager({ cwd })
    m.addWorkspace("docs")
    expect(m.workspaces).toContain(`${cwd}/docs`)
  })

  test("addWorkspace is idempotent", () => {
    const m = new PermissionManager({ cwd })
    m.addWorkspace("docs")
    m.addWorkspace("docs")
    expect(m.workspaces.filter((w) => w === `${cwd}/docs`)).toHaveLength(1)
  })

  test("removeWorkspace drops a previously added entry", () => {
    const m = new PermissionManager({ cwd })
    m.addWorkspace("docs")
    m.removeWorkspace("docs")
    expect(m.workspaces).not.toContain(`${cwd}/docs`)
  })

  test("removeWorkspace on a non-member is a no-op", () => {
    const m = new PermissionManager({ cwd })
    const before = [...m.workspaces]
    m.removeWorkspace("never-added")
    expect([...m.workspaces]).toEqual(before)
  })
})

describe("PermissionManager — rules", () => {
  test("addRule appends to the rule list", () => {
    const m = new PermissionManager({ cwd })
    m.addRule({ pattern: "ls", policy: "allow", scope: "bash" })
    expect(m.rules.find((r) => r.pattern === "ls")).toBeDefined()
  })

  test("invalidRules surfaces rules without a registered handler", () => {
    const m = new PermissionManager({ cwd })
    m.addRule({ pattern: "*", policy: "allow", scope: "no-such-scope" })
    expect(m.invalidRules.map((r) => r.scope)).toContain("no-such-scope")
  })

  test("validate throws for unregistered scopes", () => {
    const m = new PermissionManager({ cwd })
    expect(() => m.validate("no-such-scope", "anything")).toThrow(/no permission handler/)
  })

  test("custom handlers can be registered via manager.register", () => {
    const m = new PermissionManager({ cwd })
    const handler: PermissionHandler<"custom-test"> = {
      validate: (input) =>
        input === "ok" ? { verdict: "allow" } : { reason: "no", verdict: "deny" },
    }
    m.register("custom-test", handler)
    expect(m.validate("custom-test", "ok").verdict).toBe("allow")
    expect(m.validate("custom-test", "bad").verdict).toBe("deny")
  })
})

describe("parseRules", () => {
  test("bash(ls:*) → bash scope, ls:* pattern", () => {
    expect(parseRules({ allow: ["bash(ls:*)"] })).toEqual([
      { pattern: "ls:*", policy: "allow", scope: "bash" },
    ])
  })

  test("snake_case scope names round-trip (task_stop)", () => {
    expect(parseRules({ allow: ["task_stop"] })).toEqual([
      { pattern: "*", policy: "allow", scope: "task_stop" },
    ])
  })

  test("bare scope name → wildcard pattern", () => {
    expect(parseRules({ allow: ["bash"] })).toEqual([
      { pattern: "*", policy: "allow", scope: "bash" },
    ])
  })

  test("scopes are lower-cased so config can mix cases", () => {
    const r = parseRules({ deny: ["BASH(rm:*)"] })
    expect(r[0].scope).toBe("bash")
  })

  test("multiple verdicts and patterns parse together", () => {
    const r = parseRules({
      allow: ["bash(ls)", "read(*)"],
      deny: ["bash(sudo)"],
    })
    expect(r).toHaveLength(3)
    expect(r.map((x) => x.policy).toSorted()).toEqual(["allow", "allow", "deny"])
  })

  test("malformed entries are flagged with scope: 'invalid'", () => {
    const r = parseRules({ allow: ["this is not a rule!!"] })
    expect(r[0].scope).toBe("invalid")
  })
})
