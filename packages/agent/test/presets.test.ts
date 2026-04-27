import type { PermissionPolicy, PermissionOptions, PresetName } from "../src/permissions/index.ts"

import { describe, expect, test } from "vitest"
import { checkBash } from "../src/permissions/bash/check.ts"
import {
  combineFileRules,
  denySensitive,
  inRoot,
  isSensitiveFile,
} from "../src/permissions/files.ts"
import { definePermissions } from "../src/permissions/index.ts"
import { permissionPresets } from "../src/permissions/presets.ts"

function presetPolicy(name: PresetName, overrides?: Partial<PermissionOptions>): PermissionPolicy {
  return definePermissions({ preset: name, ...overrides })
}
const PRESETS = permissionPresets

describe("presets — strict", () => {
  const policy = presetPolicy("strict")

  test("ls asks (no rules)", () => {
    expect(checkBash("ls", policy).verdict).toBe("ask")
  })

  test("anything not matched asks", () => {
    expect(checkBash("any-random-cmd", policy).verdict).toBe("ask")
  })

  test("sudo still denies (hard deny)", () => {
    expect(checkBash("sudo rm -rf /tmp/foo", policy).verdict).toBe("deny")
  })
})

describe("presets — readonly (default)", () => {
  const policy = presetPolicy("readonly", { fileRead: () => "allow" })

  test("ls auto-allows", () => {
    expect(checkBash("ls -la", policy).verdict).toBe("allow")
  })

  test("read-only utilities allow", () => {
    for (const cmd of ["cat foo.ts", "head -n 5 foo", "grep TODO src/", "find . -name '*.ts'"]) {
      expect(checkBash(cmd, policy).verdict).toBe("allow")
    }
  })

  test("sed -n print allows; sed -i asks via fileWrite", () => {
    expect(checkBash("sed -n '1,20p' foo.ts", policy).verdict).toBe("allow")
    expect(checkBash("sed -i 's/x/y/' foo.ts", policy).verdict).toBe("ask")
  })

  test("ad-hoc bun -e asks (not in readonly)", () => {
    expect(checkBash("bun -e 'console.log(1)'", policy).verdict).toBe("ask")
  })

  test("git push asks", () => {
    expect(checkBash("git push origin main", policy).verdict).toBe("ask")
  })

  test("sudo still denies", () => {
    expect(checkBash("sudo cat /etc/passwd", policy).verdict).toBe("deny")
  })
})

describe("presets — permissive", () => {
  const policy = presetPolicy("permissive", {
    fileRead: () => "allow",
    fileWrite: () => "allow",
  })

  test("readonly commands still allow", () => {
    expect(checkBash("ls -la", policy).verdict).toBe("allow")
  })

  test("ad-hoc bun -e allows", () => {
    expect(checkBash("bun -e 'console.log(1)'", policy).verdict).toBe("allow")
  })

  test("git add / commit allow", () => {
    expect(checkBash("git add packages/", policy).verdict).toBe("allow")
    expect(checkBash("git commit -m 'wip'", policy).verdict).toBe("allow")
  })

  test("git push still asks (not in permissive extras)", () => {
    expect(checkBash("git push origin main", policy).verdict).toBe("ask")
  })

  test("sudo still denies", () => {
    expect(checkBash("sudo cat /etc/passwd", policy).verdict).toBe("deny")
  })

  test("npm install still asks (no broad npm rule in permissive)", () => {
    expect(checkBash("npm install bar", policy).verdict).toBe("ask")
  })

  test("bun add allows via the broad bun:* rule (caller's explicit trust)", () => {
    // The permissive preset includes a broad `bun:*` to cover ad-hoc
    // `bun foo.ts` invocations; that necessarily also allows `bun add`.
    // Tighten via overrides if you want package management gated.
    expect(checkBash("bun add foo", policy).verdict).toBe("allow")
  })
})

describe("presets — yolo", () => {
  const policy = presetPolicy("yolo")

  test("everything allows", () => {
    for (const cmd of [
      "ls",
      "rm -rf /tmp/junk",
      "bun add some-package",
      "git push origin main",
      "any-random-cmd --whatever",
    ]) {
      expect(checkBash(cmd, policy).verdict).toBe("allow")
    }
  })
})

describe("presetPolicy overrides", () => {
  test("extra rules append to preset rules (preset takes precedence)", () => {
    const policy = presetPolicy("readonly", {
      rules: [{ pattern: "ls:*", policy: "deny" }], // shadowed by preset's ls:* allow
    })
    // Preset's ls allow comes first → wins.
    expect(checkBash("ls", policy).verdict).toBe("allow")
  })

  test("extra rules unlock commands not covered by preset", () => {
    const base = presetPolicy("readonly")
    const extended = presetPolicy("readonly", {
      rules: [{ pattern: "my-tool:*", policy: "allow" }],
    })
    expect(checkBash("my-tool --foo", base).verdict).toBe("ask")
    expect(checkBash("my-tool --foo", extended).verdict).toBe("allow")
  })

  test("override fileWrite turns sed -i from ask into allow", () => {
    const allowWrites = presetPolicy("readonly", {
      fileRead: () => "allow",
      fileWrite: () => "allow",
    })
    expect(checkBash("sed -i 's/x/y/' foo.ts", allowWrites).verdict).toBe("allow")
  })
})

describe("PRESETS metadata", () => {
  test("each preset has a non-empty description", () => {
    for (const name of ["strict", "readonly", "permissive", "yolo"] as const) {
      expect(PRESETS[name].description.length).toBeGreaterThan(0)
      expect(PRESETS[name].preset).toBe(name)
    }
  })

  test("strict has only deny rules; yolo has zero rules", () => {
    expect(PRESETS.strict.rules.every((r) => r.policy === "deny")).toBe(true)
    expect(PRESETS.yolo.rules).toHaveLength(0)
  })
})

// ── files.ts helpers ────────────────────────────────────────────────────

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
    [".gitignore", false], // not in the sensitive list
    [".git/hooks/pre-commit", false], // hooks excluded
  ])("%s → %s", (path, expected) => {
    expect(isSensitiveFile(path)).toBe(expected)
  })
})

describe("inRoot", () => {
  test("absolute path inside root", () => {
    expect(inRoot("/home/user", "/home/user/project/file.ts")).toBe(true)
  })

  test("absolute path outside root", () => {
    expect(inRoot("/home/user", "/etc/passwd")).toBe(false)
  })

  test("traversal escape is rejected", () => {
    expect(inRoot("/home/user", "/home/user/../../etc/passwd")).toBe(false)
  })

  test("equal paths count as inside", () => {
    expect(inRoot("/home/user", "/home/user")).toBe(true)
  })
})

describe("combineFileRules", () => {
  test("denySensitive runs before allowWithin", () => {
    const rule = combineFileRules([denySensitive(), () => "allow"], "ask")
    expect(rule(".env.local")).toBe("deny")
    expect(rule("src/index.ts")).toBe("allow")
  })

  test("falls through to fallback when no rule matches", () => {
    const rule = combineFileRules([() => undefined, () => undefined], "ask")
    expect(rule("/tmp/x")).toBe("ask")
  })
})
