import type { PermissionOptions } from "../src/permissions/index.ts"

import { describe, expect, test } from "vitest"
import { isSensitiveFile } from "../src/permissions/handlers/files.ts"
import { PermissionManager } from "../src/permissions/index.ts"
import { permissionPresets } from "../src/permissions/presets.ts"

const cwd = "/home/folke/projects/zaly"

function manager(preset: keyof typeof permissionPresets, overrides?: Partial<PermissionOptions>) {
  return new PermissionManager({ cwd, preset, ...overrides })
}

describe("preset — strict", () => {
  const m = manager("strict")

  test("ls asks (no rules)", () => {
    expect(m.validate("bash", "ls").verdict).toBe("ask")
  })

  test("anything not matched asks", () => {
    expect(m.validate("bash", "any-random-cmd").verdict).toBe("ask")
  })

  test("sudo denies (hard deny)", () => {
    expect(m.validate("bash", "sudo rm -rf /tmp/foo").verdict).toBe("deny")
  })

  test("read inside workspace asks (Read(*) ask override)", () => {
    expect(m.validate("read", `${cwd}/src/index.ts`).verdict).toBe("ask")
  })

  test("write inside workspace asks", () => {
    expect(m.validate("write", `${cwd}/src/foo.ts`).verdict).toBe("ask")
  })

  test("sensitive paths still deny", () => {
    expect(m.validate("read", `${cwd}/.env`).verdict).toBe("deny")
  })
})

describe("preset — readonly", () => {
  const m = manager("readonly")

  test("ls allows", () => {
    expect(m.validate("bash", "ls -la").verdict).toBe("allow")
  })

  test("read-only utilities allow", () => {
    for (const cmd of ["cat foo.ts", "head -n 5 foo", "grep TODO src/", "find . -name '*.ts'"]) {
      expect(m.validate("bash", cmd).verdict).toBe("allow")
    }
  })

  test("ad-hoc bun -e asks (not in readonly)", () => {
    expect(m.validate("bash", "bun -e 'console.log(1)'").verdict).toBe("ask")
  })

  test("git push asks", () => {
    expect(m.validate("bash", "git push origin main").verdict).toBe("ask")
  })

  test("sudo denies", () => {
    expect(m.validate("bash", "sudo cat /etc/passwd").verdict).toBe("deny")
  })

  test("read inside workspace allows (default-allow)", () => {
    expect(m.validate("read", `${cwd}/src/index.ts`).verdict).toBe("allow")
  })

  test("write inside workspace asks (default-ask for writes)", () => {
    expect(m.validate("write", `${cwd}/src/foo.ts`).verdict).toBe("ask")
  })
})

describe("preset — permissive", () => {
  const m = manager("permissive")

  test("readonly commands still allow", () => {
    expect(m.validate("bash", "ls -la").verdict).toBe("allow")
  })

  test("ad-hoc bun -e allows", () => {
    expect(m.validate("bash", "bun -e 'console.log(1)'").verdict).toBe("allow")
  })

  test("git add / commit allow", () => {
    expect(m.validate("bash", "git add packages/").verdict).toBe("allow")
    expect(m.validate("bash", "git commit -m 'wip'").verdict).toBe("allow")
  })

  test("git push asks (not in permissive extras)", () => {
    expect(m.validate("bash", "git push origin main").verdict).toBe("ask")
  })

  test("sudo denies", () => {
    expect(m.validate("bash", "sudo cat /etc/passwd").verdict).toBe("deny")
  })

  test("npm install asks (no broad npm rule)", () => {
    expect(m.validate("bash", "npm install bar").verdict).toBe("ask")
  })

  test("write inside workspace allows (Write(*) rule)", () => {
    expect(m.validate("write", `${cwd}/src/foo.ts`).verdict).toBe("allow")
  })

  test("write to sensitive path still denies", () => {
    expect(m.validate("write", `${cwd}/.env`).verdict).toBe("deny")
  })
})

describe("preset — yolo", () => {
  const m = manager("yolo")

  test("everything bash allows", () => {
    for (const cmd of [
      "ls",
      "rm -rf /tmp/junk",
      "bun add some-package",
      "git push origin main",
      "any-random-cmd --whatever",
    ]) {
      expect(m.validate("bash", cmd).verdict).toBe("allow")
    }
  })

  test("reads + writes inside workspace allow", () => {
    expect(m.validate("read", `${cwd}/src/index.ts`).verdict).toBe("allow")
    expect(m.validate("write", `${cwd}/src/foo.ts`).verdict).toBe("allow")
  })

  test("sensitive files still deny", () => {
    // The handler enforces sensitive-deny before consulting rules; even
    // yolo doesn't override that.
    expect(m.validate("read", `${cwd}/.env`).verdict).toBe("deny")
  })
})

describe("preset overrides", () => {
  test("user rules override preset rules on conflict", () => {
    // Explicit user `deny Bash(ls:*)` shadows the readonly preset's
    // `allow Bash(ls:*)` because user rules are matched first.
    const m = new PermissionManager({
      cwd,
      preset: "readonly",
      rules: { deny: ["bash(ls:*)"] },
    })
    expect(m.validate("bash", "ls").verdict).toBe("deny")
  })

  test("extra rules unlock commands not covered by preset", () => {
    const base = manager("readonly")
    const extended = new PermissionManager({
      cwd,
      preset: "readonly",
      rules: { allow: ["bash(my-tool:*)"] },
    })
    expect(base.validate("bash", "my-tool --foo").verdict).toBe("ask")
    expect(extended.validate("bash", "my-tool --foo").verdict).toBe("allow")
  })
})

describe("permissionPresets metadata", () => {
  test("each preset has a non-empty description", () => {
    for (const name of ["strict", "readonly", "permissive", "yolo"] as const) {
      expect(permissionPresets[name].description.length).toBeGreaterThan(0)
    }
  })

  test("strict has only deny + ask; yolo has only allow", () => {
    const strictRules: Record<string, unknown> = permissionPresets.strict.rules
    const yoloRules: Record<string, unknown> = permissionPresets.yolo.rules
    expect(strictRules.allow).toBeUndefined()
    expect(yoloRules.deny).toBeUndefined()
    expect(yoloRules.ask).toBeUndefined()
  })
})

// ── files/utils.ts ─────────────────────────────────────────────────────────

describe("isSensitiveFile", () => {
  test.each([
    [".env", true],
    [".env.local", true],
    [".env.production", true],
    ["foo/.env.local", true],
    [".ssh/id_rsa", true],
    [".aws/credentials", true],
    [".netrc", true],
    [".git/config", true],
    ["src/index.ts", false],
    ["package.json", false],
    [".gitignore", false],
    [".git/hooks/pre-commit", false],
  ])("%s → %s", (path, expected) => {
    expect(isSensitiveFile(path)).toBe(expected)
  })
})
