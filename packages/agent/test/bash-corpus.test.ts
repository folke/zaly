import { describe, expect, test } from "vitest"
import { parseBash } from "../src/permissions/handlers/bash/parser.ts"
import { PermissionManager } from "../src/permissions/index.ts"
import bash from "./bash.json" with { type: "json" }

/**
 * Coverage report against the recorded session corpus. Not a pass/fail
 * — a snapshot of what fraction of real LLM-driven commands fall into
 * each verdict bucket given the `permissive` preset, plus a histogram
 * of the commands that didn't auto-allow so we can see which rules to
 * add next.
 *
 * The corpus reads files all over the disk (absolute paths in /home/…),
 * so we pre-seed the workspace with `/` to keep file checks from
 * dominating the histogram with workspace-related asks.
 */
const m = new PermissionManager({
  cwd: "/",
  preset: "permissive",
  rules: { allow: ["read(*)"] }, // permit reads anywhere for the snapshot
})

describe("permissions: bash.json corpus coverage", () => {
  test("compute and log verdict distribution", () => {
    const stats = { allow: 0, ask: 0, deny: 0 }
    const blockers = new Map<string, { count: number; example: string }>()
    let unparseable = 0
    let unparseableExample = ""

    for (const { command } of bash) {
      const r = m.validate("bash", command)
      stats[r.verdict]++

      if (r.verdict === "allow") continue

      // Re-parse to identify the first non-allow segment for the histogram.
      const parsed = parseBash(command)
      if (!parsed.ok) {
        unparseable++
        if (unparseableExample === "") unparseableExample = command
        continue
      }
      // First segment is a reasonable proxy for the blocker without
      // re-running per-segment validation.
      const seg = parsed.segments[0]
      const key = blockerKey(seg.cmd, seg.args)
      const prev = blockers.get(key)
      if (prev) prev.count++
      else blockers.set(key, { count: 1, example: command })
    }

    const total = bash.length
    const pct = (n: number) => `${((n / total) * 100).toFixed(1)}%`
    const ranked = [...blockers.entries()]
      .toSorted(([, a], [, b]) => b.count - a.count)
      .slice(0, 30)

    const lines = [
      ``,
      `── permissions corpus (${total} commands) ──`,
      `  allow:  ${stats.allow} (${pct(stats.allow)})`,
      `  ask:    ${stats.ask} (${pct(stats.ask)})`,
      `  deny:   ${stats.deny} (${pct(stats.deny)})`,
      `  unparseable: ${unparseable}${unparseable > 0 ? `  e.g. ${truncate(unparseableExample, 80)}` : ""}`,
      ``,
      `  top blockers (count → cmd → example):`,
      ...ranked.map(
        ([key, { count, example }]) =>
          `    ${count.toString().padStart(4, " ")}  ${key.padEnd(28, " ")} ${truncate(example, 100)}`
      ),
    ]
    console.log(lines.join("\n"))

    expect(stats.allow + stats.ask + stats.deny).toBe(total)
    expect(stats.allow).toBeGreaterThan(0)
  })
})

/** Group key for a blocking segment. `cmd subcmd` when the first arg
 *  looks like a subcommand (no dash/slash/glob); else just `cmd`. */
function blockerKey(cmd: string, args: string[]): string {
  if (args.length === 0) return cmd
  const first = args[0]
  if (first.startsWith("-") || first.includes("/") || first.includes("*")) return cmd
  return `${cmd} ${first}`
}

function truncate(s: string, n: number): string {
  const single = s.replace(/\s+/g, " ")
  return single.length > n ? `${single.slice(0, n - 1)}…` : single
}
