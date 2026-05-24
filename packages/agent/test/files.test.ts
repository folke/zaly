import type { Rule } from "../src/permissions/types.ts"

import { describe, expect, test } from "vitest"
import { fileHandler } from "../src/permissions/handlers/files.ts"

const cwd = "/home/folke/projects/zaly"

const validate = (
  scope: "read" | "write",
  path: string,
  opts: { rules?: Rule<"read" | "write">[]; workspaces?: string[] } = {}
) =>
  fileHandler.validate(path, {
    cwd,
    rules: opts.rules ?? [],
    scope,
    validate: () => ({ verdict: "allow" }),
    workspaces: opts.workspaces ?? [cwd],
  })

describe("fileHandler — workspace containment", () => {
  test("path outside any workspace asks with a workspace suggestion", () => {
    const r = validate("read", "/etc/hosts")
    if (r.verdict === "allow") throw new Error("expected non-allow")
    expect(r.verdict).toBe("ask")
    expect(r.suggestions?.[0]).toMatchObject({ kind: "workspace", path: "/etc" })
  })

  test("path equal to the workspace root allows (no rule body to match)", () => {
    expect(validate("read", cwd).verdict).toBe("allow")
    expect(validate("write", cwd).verdict).toBe("allow")
  })

  test("longest-prefix workspace wins when multiple workspaces overlap", () => {
    // The deeper workspace `${cwd}/src` should be picked, so the rule
    // `/index.ts` (workspace-relative) matches and denies.
    const r = validate("read", `${cwd}/src/index.ts`, {
      rules: [{ pattern: "/index.ts", policy: "deny", scope: "read" }],
      workspaces: [cwd, `${cwd}/src`],
    })
    expect(r.verdict).toBe("deny")
  })
})

describe("fileHandler — defaults inside a workspace", () => {
  test("read with no matching rule defaults to allow", () => {
    expect(validate("read", `${cwd}/src/index.ts`).verdict).toBe("allow")
  })

  test("write with no matching rule defaults to ask, with a rule suggestion", () => {
    const r = validate("write", `${cwd}/src/index.ts`)
    if (r.verdict === "allow") throw new Error("expected non-allow")
    expect(r.verdict).toBe("ask")
    expect(r.suggestions?.[0]).toMatchObject({ kind: "rule", scope: "write" })
  })
})

describe("fileHandler — sensitive paths", () => {
  test("sensitive paths deny regardless of workspace rules", () => {
    expect(validate("read", `${cwd}/.env`).verdict).toBe("deny")
  })

  test("sensitive deny precedes allow rules", () => {
    const r = validate("read", `${cwd}/.env`, {
      rules: [{ pattern: "*", policy: "allow", scope: "read" }],
    })
    expect(r.verdict).toBe("deny")
  })
})

describe("fileHandler — rule precedence", () => {
  test("first matching rule wins", () => {
    const r = validate("read", `${cwd}/src/index.ts`, {
      rules: [
        { pattern: "/src/index.ts", policy: "allow", scope: "read" },
        { pattern: "/src/index.ts", policy: "deny", scope: "read" },
      ],
    })
    expect(r.verdict).toBe("allow")
  })

  test("specific promoted allow can beat a later broad ask", () => {
    const r = validate("read", `${cwd}/README.ts`, {
      rules: [
        { pattern: "/README.ts", policy: "allow", scope: "read" },
        { pattern: "*", policy: "ask", scope: "read" },
      ],
    })
    expect(r.verdict).toBe("allow")
  })

  test("earlier ask can still beat a later allow", () => {
    const r = validate("read", `${cwd}/src/foo.ts`, {
      rules: [
        { pattern: "/src/foo.ts", policy: "ask", scope: "read" },
        { pattern: "/src/*", policy: "allow", scope: "read" },
      ],
    })
    expect(r.verdict).toBe("ask")
  })

  test("explicit allow rule promotes a write past the default ask", () => {
    const r = validate("write", `${cwd}/src/foo.ts`, {
      rules: [{ pattern: "/src/*", policy: "allow", scope: "write" }],
    })
    expect(r.verdict).toBe("allow")
  })
})

describe("fileHandler — absolute / home patterns", () => {
  test("//abs pattern matches absolute path inside workspace", () => {
    const r = validate("read", `${cwd}/src/index.ts`, {
      rules: [{ pattern: `/${cwd}/src/index.ts`, policy: "deny", scope: "read" }],
    })
    expect(r.verdict).toBe("deny")
  })

  test("//abs pattern outside the candidate workspace is silently dropped", () => {
    // Pattern resolves outside `cwd`; should NOT affect the result.
    const r = validate("read", `${cwd}/src/index.ts`, {
      rules: [{ pattern: "//etc/hosts", policy: "deny", scope: "read" }],
    })
    expect(r.verdict).toBe("allow")
  })
})
