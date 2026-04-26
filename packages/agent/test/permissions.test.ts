import type { Rule } from "../src/permissions/index.ts"

import { describe, expect, test } from "vitest"
import { checkBash } from "../src/permissions/check.ts"
import { definePermissions } from "../src/permissions/index.ts"
import { parseBash } from "../src/permissions/parser.ts"
import { matchRule } from "../src/permissions/rules.ts"

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
    // `time (subshell)` after flatten leaves a `time` segment with no
    // wrapped command. It should disappear, not become an unparseable.
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
    // Common shape: `bun -e '...template literal `tpl` ...'`. The
    // backtick is part of the JS source, not shell command substitution.
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
    // Args containing a literal colon are matched as-is (the colon is
    // only meaningful as the `:*` wildcard suffix, not as a separator).
    { expected: true, input: seg("bun", ["test:node"]), rule: "bun test:node" },
    { expected: false, input: seg("bun", ["test:node", "--flag"]), rule: "bun test:node" },
    { expected: true, input: seg("bun", ["test:node", "--flag"]), rule: "bun test:node:*" },
    { expected: true, input: seg("bun", ["test:bun"]), rule: "bun test:bun:*" },
    { expected: false, input: seg("bun", ["test:other"]), rule: "bun test:bun:*" },
  ]

  for (const c of cases) {
    test(`"${c.rule}" vs ${c.input.cmd} ${c.input.args.join(" ")}`.trim(), () => {
      expect(matchRule({ pattern: c.rule, policy: "allow" }, c.input)).toBe(c.expected)
    })
  }
})

describe("checkBash — cwd safety", () => {
  // Policy: allow ls + cat + cd; fileRead allows everything *if asked
  // about an absolute path*, denies relative paths so we can verify
  // the wrap kicked in.
  const policy = definePermissions({
    rules: [
      { pattern: "ls:*", policy: "allow" },
      { pattern: "cat:*", policy: "allow" },
      { pattern: "cd:*", policy: "allow" },
    ],
    fileRead: () => "allow",
    fileWrite: () => "allow",
  })

  test("relative path is auto-allowed when no cd present", () => {
    expect(checkBash("cat src/index.ts", policy).verdict).toBe("allow")
  })

  test("relative path forces ask when a cd segment is present", () => {
    expect(checkBash("cd /tmp && cat passwd", policy).verdict).toBe("ask")
  })

  test("absolute path stays allowed even with cd present", () => {
    expect(checkBash("cd /tmp && cat /etc/hostname", policy).verdict).toBe("allow")
  })

  test("pushd / popd also trigger the cwd guard", () => {
    expect(checkBash("pushd /tmp; cat passwd", policy).verdict).toBe("ask")
    expect(checkBash("popd; cat foo", policy).verdict).toBe("ask")
  })

  test("cd alone (no chain) doesn't break anything", () => {
    expect(checkBash("cd packages/tui", policy).verdict).toBe("allow")
  })
})

describe("checkBash — dynamic execution", () => {
  const policy = definePermissions({
    rules: [
      { pattern: "ls:*", policy: "allow" },
      { pattern: "echo:*", policy: "allow" },
    ],
    fileRead: () => "allow",
    fileWrite: () => "allow",
  })

  test("source forces ask", () => {
    expect(checkBash("source ~/.bashrc", policy).verdict).toBe("ask")
  })

  test(". (source alias) forces ask", () => {
    expect(checkBash(". ./script.sh", policy).verdict).toBe("ask")
  })

  test("eval forces ask", () => {
    expect(checkBash("eval 'ls -la'", policy).verdict).toBe("ask")
  })

  test("exec forces ask", () => {
    expect(checkBash("exec bun test", policy).verdict).toBe("ask")
  })

  test("a chain with one dynamic-exec segment forces ask overall", () => {
    expect(checkBash("ls && eval 'something'", policy).verdict).toBe("ask")
  })
})

describe("checkBash — end-to-end", () => {
  const policy = definePermissions({
    rules: [
      { pattern: "ls:*", policy: "allow" },
      { pattern: "echo:*", policy: "allow" },
      { pattern: "git status:*", policy: "allow" },
      { pattern: "git diff:*", policy: "allow" },
      { pattern: "git push:*", policy: "ask" },
      { pattern: "rm:*", policy: "ask" },
      { pattern: "sudo:*", policy: "deny" },
      { pattern: "sed:*", policy: "allow" },
      { pattern: "cat:*", policy: "allow" },
      { pattern: "head:*", policy: "allow" },
      { pattern: "wc:*", policy: "allow" },
      { pattern: "grep:*", policy: "allow" },
    ] as Rule[],
    fileRead: () => "allow",
    fileWrite: () => "ask",
  })

  test("plain ls auto-allows", () => {
    expect(checkBash("ls -la", policy).verdict).toBe("allow")
  })

  test("sed -n print is allowed (the Claude Code gripe)", () => {
    const r = checkBash("sed -n '1,20p' src/index.ts", policy)
    expect(r.verdict).toBe("allow")
  })

  test("sed -i (in-place) escalates to ask via fileWrite", () => {
    const r = checkBash("sed -i 's/foo/bar/' src/index.ts", policy)
    expect(r.verdict).toBe("ask")
  })

  test("sed with `w` script command is unsafe → ask", () => {
    const r = checkBash("sed -e 'w /tmp/out' src/index.ts", policy)
    expect(r.verdict).toBe("ask")
  })

  test("piped read-only commands all allow", () => {
    expect(checkBash("cat foo.ts | head -n 50 | grep TODO", policy).verdict).toBe("allow")
  })

  test("git push asks", () => {
    expect(checkBash("git push origin main", policy).verdict).toBe("ask")
  })

  test("sudo denies", () => {
    expect(checkBash("sudo rm -rf /tmp/foo", policy).verdict).toBe("deny")
  })

  test("unknown command → fallback ask", () => {
    expect(checkBash("some-random-cmd --flag", policy).verdict).toBe("ask")
  })

  test("command substitution forces ask", () => {
    expect(checkBash("echo $(whoami)", policy).verdict).toBe("ask")
  })

  test("redirect to file forces ask via fileWrite", () => {
    expect(checkBash("ls > /tmp/out.txt", policy).verdict).toBe("ask")
  })

  test("redirect to /dev/null stays allow", () => {
    expect(checkBash("ls > /dev/null 2>&1", policy).verdict).toBe("allow")
  })

  test("chain: deny in any segment denies the whole", () => {
    const r = checkBash("ls && sudo rm -rf /tmp", policy)
    expect(r.verdict).toBe("deny")
  })

  test("chain: ask in any segment asks", () => {
    const r = checkBash("ls && git push", policy)
    expect(r.verdict).toBe("ask")
  })
})
