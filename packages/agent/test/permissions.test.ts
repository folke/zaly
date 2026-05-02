import { describe, expect, test } from "vitest"
import { parseBash } from "../src/permissions/handlers/bash/parser.ts"
import { matchRule } from "../src/permissions/handlers/bash/rules.ts"
import { PermissionManager } from "../src/permissions/index.ts"

const cwd = "/home/folke/projects/zaly"

// ── parseBash ──────────────────────────────────────────────────────────────

describe("parseBash — basics", () => {
  test("plain command", () => {
    const r = parseBash("ls -la /tmp")
    if (!r.ok) throw new Error("expected ok")
    expect(r.segments).toHaveLength(1)
    expect(r.segments[0].cmd).toBe("ls")
    expect(r.segments[0].args).toEqual(["-la", "/tmp"])
  })

  test("pipe → multiple segments", () => {
    const r = parseBash("ls | grep foo | head -n 5")
    if (!r.ok) throw new Error("expected ok")
    expect(r.segments.map((s) => s.cmd)).toEqual(["ls", "grep", "head"])
  })

  test("&& and ; create segments", () => {
    const r = parseBash("ls && echo done; pwd")
    if (!r.ok) throw new Error("expected ok")
    expect(r.segments.map((s) => s.cmd)).toEqual(["ls", "echo", "pwd"])
  })

  test("globs pass through as patterns", () => {
    const r = parseBash("ls *.ts")
    if (!r.ok) throw new Error("expected ok")
    expect(r.segments[0].args).toEqual(["*.ts"])
  })

  test("comments are stripped", () => {
    const r = parseBash("ls # show files")
    if (!r.ok) throw new Error("expected ok")
    expect(r.segments[0].cmd).toBe("ls")
    expect(r.segments[0].args).toEqual([])
  })

  test("redirect to /dev/null is invisible", () => {
    const r = parseBash("ls > /dev/null 2>&1")
    if (!r.ok) throw new Error("expected ok")
    expect(r.segments[0].writes).toEqual([])
  })

  test("redirect to file is captured", () => {
    const r = parseBash("ls > out.txt")
    if (!r.ok) throw new Error("expected ok")
    expect(r.segments[0].writes).toEqual([{ mode: "trunc", path: "out.txt" }])
  })

  test("append redirect is captured with append mode", () => {
    const r = parseBash("ls >> log.txt")
    if (!r.ok) throw new Error("expected ok")
    expect(r.segments[0].writes).toEqual([{ mode: "append", path: "log.txt" }])
  })

  test("input redirect is captured", () => {
    const r = parseBash("wc -l < input.txt")
    if (!r.ok) throw new Error("expected ok")
    expect(r.segments[0].reads).toEqual(["input.txt"])
  })

  test("fd-prefixed redirect (`2>&1`) doesn't leak the fd into args", () => {
    const r = parseBash("echo hi 2>&1")
    if (!r.ok) throw new Error("expected ok")
    expect(r.segments[0].cmd).toBe("echo")
    // The leading `2` of `2>&1` is shell-quote's separately-tokenized
    // source fd; it must not show up as a command argument.
    expect(r.segments[0].args).toEqual(["hi"])
    expect(r.segments[0].writes).toEqual([])
    expect(r.segments[0].reads).toEqual([])
  })

  test("fd-prefixed file redirect (`2>err.log`) writes the file, drops the fd", () => {
    const r = parseBash("cmd 2>err.log")
    if (!r.ok) throw new Error("expected ok")
    expect(r.segments[0].cmd).toBe("cmd")
    expect(r.segments[0].args).toEqual([])
    expect(r.segments[0].writes).toEqual([{ mode: "trunc", path: "err.log" }])
  })

  test("combined `>file 2>&1` keeps both pieces clean", () => {
    const r = parseBash("cmd > out.log 2>&1")
    if (!r.ok) throw new Error("expected ok")
    expect(r.segments[0].cmd).toBe("cmd")
    expect(r.segments[0].args).toEqual([])
    expect(r.segments[0].writes).toEqual([{ mode: "trunc", path: "out.log" }])
  })

  test("digit args that are NOT followed by a redirect stay as args", () => {
    // `head -n 5` — the `5` must remain an arg even though it's purely
    // numeric, because the next token is not a redirect op.
    const r = parseBash("head -n 5 file.txt")
    if (!r.ok) throw new Error("expected ok")
    expect(r.segments[0].cmd).toBe("head")
    expect(r.segments[0].args).toEqual(["-n", "5", "file.txt"])
  })
})

describe("parseBash — wrapper commands stripped", () => {
  test("`time cmd` evaluates as `cmd`", () => {
    const r = parseBash("time bun test")
    if (!r.ok) throw new Error("expected ok")
    expect(r.segments).toHaveLength(1)
    expect(r.segments[0].cmd).toBe("bun")
    expect(r.segments[0].args).toEqual(["test"])
  })

  test("`time -p cmd` strips wrapper flag too", () => {
    const r = parseBash("time -p bun test")
    if (!r.ok) throw new Error("expected ok")
    expect(r.segments[0].cmd).toBe("bun")
    expect(r.segments[0].args).toEqual(["test"])
  })

  test("nested wrappers strip in order: `time nice -n 5 cmd` → `cmd`", () => {
    const r = parseBash("time nice -n 5 bun test")
    if (!r.ok) throw new Error("expected ok")
    expect(r.segments[0].cmd).toBe("bun")
    expect(r.segments[0].args).toEqual(["test"])
  })

  test("bare wrapper with no command is dropped from segments", () => {
    const r = parseBash("time (ls && pwd)")
    if (!r.ok) throw new Error("expected ok")
    expect(r.segments.map((s) => s.cmd)).toEqual(["ls", "pwd"])
  })

  test("`sudo` is NOT a wrapper (always flagged)", () => {
    const r = parseBash("sudo cat /etc/passwd")
    if (!r.ok) throw new Error("expected ok")
    expect(r.segments[0].cmd).toBe("sudo")
  })
})

describe("parseBash — command substitution flagged", () => {
  test("$(...) sets hasCommandSubst", () => {
    const r = parseBash("echo $(pwd)")
    if (!r.ok) throw new Error("expected ok")
    expect(r.segments[0].hasCommandSubst).toBe(true)
  })

  test("backticks set hasCommandSubst", () => {
    const r = parseBash("echo `pwd`")
    if (!r.ok) throw new Error("expected ok")
    expect(r.segments[0].hasCommandSubst).toBe(true)
  })

  test("backticks inside single quotes are literal (not flagged)", () => {
    // oxlint-disable-next-line no-template-curly-in-string
    const r = parseBash("bun -e 'const x = `hello ${name}`'")
    if (!r.ok) throw new Error("expected ok")
    expect(r.segments[0].hasCommandSubst).toBe(false)
  })

  test("backticks in double quotes still flag (bash substitutes there)", () => {
    const r = parseBash('echo "value is `pwd`"')
    if (!r.ok) throw new Error("expected ok")
    expect(r.segments[0].hasCommandSubst).toBe(true)
  })

  test("subshell parens are inlined as independent segments (no hasCommandSubst)", () => {
    const r = parseBash("(ls && pwd) | head")
    if (!r.ok) throw new Error("expected ok")
    expect(r.segments.map((s) => s.cmd)).toEqual(["ls", "pwd", "head"])
    expect(r.segments.every((s) => !s.hasCommandSubst)).toBe(true)
  })

  test("nested subshells flatten correctly", () => {
    const r = parseBash("(cd a && (cd b && pwd)) | tail")
    if (!r.ok) throw new Error("expected ok")
    expect(r.segments.map((s) => s.cmd)).toEqual(["cd", "cd", "pwd", "tail"])
  })

  test("$(cmd) inside a subshell still flags hasCommandSubst", () => {
    const r = parseBash("(echo $(pwd))")
    if (!r.ok) throw new Error("expected ok")
    expect(r.segments.some((s) => s.hasCommandSubst)).toBe(true)
  })

  test("heredoc fails to parse and forces ask", () => {
    const r = parseBash("cat <<EOF\nhi\nEOF")
    expect(r.ok).toBe(false)
  })
})

// ── matchRule ──────────────────────────────────────────────────────────────

function seg(cmd: string, args: string[] = []) {
  return { args, cmd, hasCommandSubst: false, reads: [], writes: [] }
}

describe("matchRule — pattern syntax", () => {
  const cases: { rule: string; input: ReturnType<typeof seg>; expected: boolean }[] = [
    { expected: true, input: seg("ls"), rule: "ls" },
    { expected: false, input: seg("ls", ["-la"]), rule: "ls" },
    { expected: true, input: seg("ls"), rule: "ls:*" },
    { expected: true, input: seg("ls", ["-la", "/tmp"]), rule: "ls:*" },
    { expected: true, input: seg("git", ["status"]), rule: "git status" },
    { expected: false, input: seg("git", ["status", "--short"]), rule: "git status" },
    { expected: true, input: seg("git", ["status", "--short"]), rule: "git status:*" },
    { expected: true, input: seg("git", ["status"]), rule: "git status:*" },
    { expected: false, input: seg("git", ["push"]), rule: "git status:*" },
    { expected: true, input: seg("npm", ["install"]), rule: "npm install:*" },
    { expected: false, input: seg("npm", ["uninstall"]), rule: "npm install:*" },
    { expected: true, input: seg("bun", ["test:node"]), rule: "bun test:node" },
    { expected: false, input: seg("bun", ["test:node", "--flag"]), rule: "bun test:node" },
    { expected: true, input: seg("bun", ["test:node", "--flag"]), rule: "bun test:node:*" },
    { expected: true, input: seg("bun", ["test:bun"]), rule: "bun test:bun:*" },
    { expected: false, input: seg("bun", ["test:other"]), rule: "bun test:bun:*" },
    // Bare `*` matches any command (used by `Bash` rule with no parens).
    { expected: true, input: seg("anything", ["whatever"]), rule: "*" },
    { expected: true, input: seg("ls"), rule: "*" },
  ]

  for (const c of cases) {
    test(`"${c.rule}" vs ${c.input.cmd} ${c.input.args.join(" ")}`.trim(), () => {
      expect(matchRule({ pattern: c.rule, policy: "allow", scope: "bash" }, c.input)).toBe(
        c.expected
      )
    })
  }
})

// ── PermissionManager + bash handler — end-to-end ─────────────────────────

describe("PermissionManager.validate('bash') — end-to-end", () => {
  function build() {
    return new PermissionManager({
      cwd,
      rules: {
        allow: [
          "bash(ls:*)",
          "bash(echo:*)",
          "bash(git status:*)",
          "bash(git diff:*)",
          "bash(sed:*)",
          "bash(cat:*)",
          "bash(head:*)",
          "bash(wc:*)",
          "bash(grep:*)",
          // Allow everything for files so the bash handler's read/write
          // delegation doesn't escalate on its own.
          "read(*)",
          "write(*)",
        ],
        ask: ["bash(git push:*)", "bash(rm:*)"],
        deny: ["bash(sudo:*)"],
      },
    })
  }
  const m = build()

  test("plain ls auto-allows", () => {
    expect(m.validate("bash", "ls -la").verdict).toBe("allow")
  })

  test("sed -n print is allowed", () => {
    expect(m.validate("bash", "sed -n '1,20p' src/index.ts").verdict).toBe("allow")
  })

  test("sed with `w` script command is unsafe → ask", () => {
    expect(m.validate("bash", "sed -e 'w /tmp/out' src/index.ts").verdict).toBe("ask")
  })

  test("piped read-only commands all allow", () => {
    expect(m.validate("bash", "cat foo.ts | head -n 50 | grep TODO").verdict).toBe("allow")
  })

  test("git push asks", () => {
    expect(m.validate("bash", "git push origin main").verdict).toBe("ask")
  })

  test("sudo denies", () => {
    expect(m.validate("bash", "sudo rm -rf /tmp/foo").verdict).toBe("deny")
  })

  test("unknown command → ask (no rule matches)", () => {
    expect(m.validate("bash", "some-random-cmd --flag").verdict).toBe("ask")
  })

  test("command substitution forces ask", () => {
    expect(m.validate("bash", "echo $(whoami)").verdict).toBe("ask")
  })

  test("redirect to /dev/null is invisible (file handler not consulted)", () => {
    expect(m.validate("bash", "ls > /dev/null 2>&1").verdict).toBe("allow")
  })

  test("chain: deny in any segment denies the whole", () => {
    expect(m.validate("bash", "ls && sudo rm -rf /tmp").verdict).toBe("deny")
  })

  test("chain: ask in any segment asks", () => {
    expect(m.validate("bash", "ls && git push").verdict).toBe("ask")
  })
})

describe("PermissionManager.validate('bash') — file delegation", () => {
  test("redirect to file delegates to file handler (write inside cwd → ask by default)", () => {
    const m = new PermissionManager({
      cwd,
      rules: { allow: ["bash(ls:*)"] },
    })
    // Write inside workspace, no Write rule → ask by default.
    expect(m.validate("bash", "ls > out.txt").verdict).toBe("ask")
  })

  test("redirect to file with Write(*) allow rule allows", () => {
    const m = new PermissionManager({
      cwd,
      rules: { allow: ["bash(ls:*)", "write(*)"] },
    })
    expect(m.validate("bash", "ls > out.txt").verdict).toBe("allow")
  })

  test("redirect to sensitive file denies (file handler enforces sensitive deny)", () => {
    const m = new PermissionManager({
      cwd,
      rules: { allow: ["bash(echo:*)", "write(*)"] },
    })
    expect(m.validate("bash", "echo secret > .env").verdict).toBe("deny")
  })
})
