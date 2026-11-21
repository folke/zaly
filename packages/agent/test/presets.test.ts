import type { PermissionOptions } from "../src/permissions/index.ts"

import { describe, expect, test } from "vitest"
import { isSensitiveFile } from "../src/permissions/handlers/files.ts"
import { PermissionManager } from "../src/permissions/manager.ts"
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

  test("sensitive paths ask", () => {
    expect(m.validate("read", `${cwd}/.env`).verdict).toBe("ask")
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

  test("write to sensitive path asks", () => {
    expect(m.validate("write", `${cwd}/.env`).verdict).toBe("ask")
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
      "find packages -name package.json -exec sed -n '1,120p' {} ;",
      "any-random-cmd --whatever",
    ]) {
      expect(m.validate("bash", cmd).verdict).toBe("allow")
    }
  })

  test.each(["cat <<'EOF'\nhello\nEOF", 'cat "$FILE"', 'echo hello > "$OUTPUT"'])(
    "shell fallback allows under yolo: %s",
    (command) => {
      expect(m.validate("bash", command).verdict).toBe("allow")
    }
  )

  test("shell fallback preserves explicit restrictions", () => {
    const command = "cat <<'EOF'\nhello\nEOF"
    for (const rule of ["bash(cat:*)", "read(secret.txt)", "write(secret.txt)"]) {
      const restricted = manager("yolo", { rules: { deny: [rule] } })
      expect(restricted.validate("bash", command).verdict).toBe("ask")
    }
    const restricted = manager("yolo", { rules: { ask: ["write(secret.txt)"] } })
    expect(restricted.validate("bash", 'echo hello > "$OUTPUT"').verdict).toBe("ask")
    expect(manager("readonly").validate("bash", 'cat "$FILE"').verdict).toBe("ask")
  })

  test("reads + writes inside workspace allow", () => {
    expect(m.validate("read", `${cwd}/src/index.ts`).verdict).toBe("allow")
    expect(m.validate("write", `${cwd}/src/foo.ts`).verdict).toBe("allow")
  })

  test("sensitive files allow", () => {
    expect(m.validate("read", `${cwd}/.env`).verdict).toBe("allow")
    expect(m.validate("write", `${cwd}/.env`).verdict).toBe("allow")
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

describe("sensitive file policy", () => {
  const paths = [".env", ".ssh/config", ".git/config", ".npmrc", "secrets/token"]
  test.each(["strict", "readonly", "permissive", "yolo"] as const)(
    "%s applies to sensitive files inside and outside workspaces",
    (preset) => {
      const m = manager(preset)
      for (const scope of ["read", "write"]) {
        for (const path of paths) {
          for (const base of [cwd, "/outside"]) {
            expect(m.validate(scope, `${base}/${path}`).verdict).toBe(
              preset === "yolo" ? "allow" : "ask"
            )
          }
        }
      }
    }
  )

  test.each(["strict", "readonly", "permissive", "yolo"] as const)(
    "%s honors explicit allow, ask, and deny rules",
    (preset) => {
      for (const scope of ["read", "write"]) {
        for (const policy of ["allow", "ask", "deny"] as const) {
          const m = manager(preset, { rules: [{ scope, pattern: "/.env", policy }] })
          expect(m.validate(scope, `${cwd}/.env`).verdict).toBe(policy)
        }
      }
    }
  )

  test("sensitive prompts explain the operation and suggest only the absolute file", () => {
    const m = manager("permissive")
    for (const scope of ["read", "write"]) {
      const result = m.validate(scope, "/outside/.ssh/config")
      if (result.verdict !== "ask") throw new Error("Expected confirmation")
      expect(result.ask).toContain(scope === "read" ? "reading" : "writing")
      expect(result.ask).toContain("potentially sensitive file")
      expect(result.suggestions).toEqual([
        { kind: "rule", scope, pattern: "//outside/.ssh/config" },
      ])
      const suggestion = result.suggestions?.[0]
      if (suggestion?.kind !== "rule") throw new Error("Expected a file rule")
      m.addRule({ scope, pattern: suggestion.pattern, policy: "allow" })
      expect(m.validate(scope, "/outside/.ssh/config").verdict).toBe("allow")
      expect(m.validate(scope, "/outside/.ssh/id_rsa").verdict).toBe("ask")
    }
  })

  test("workspace trust does not authorize sensitive files", () => {
    const m = new PermissionManager({ cwd, workspaces: ["/outside"] })
    expect(m.validate("read", "/outside/.env").verdict).toBe("ask")
    expect(m.validate("write", "/outside/.env").verdict).toBe("ask")
  })

  test.each(["readonly", "permissive", "yolo"] as const)(
    "%s applies sensitive policy through shell file delegation",
    (preset) => {
      const m = manager(preset)
      for (const command of ["cat .env", "cat < .env", "echo value > .env"]) {
        expect(m.validate("bash", command).verdict).toBe(preset === "yolo" ? "allow" : "ask")
      }
      const restricted = manager(preset, { rules: { deny: ["read(.env)", "write(.env)"] } })
      expect(restricted.validate("bash", "cat .env").verdict).toBe("deny")
      expect(restricted.validate("bash", "echo value > .env").verdict).toBe("deny")
    }
  )
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
