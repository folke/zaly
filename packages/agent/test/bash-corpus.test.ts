import { describe, expect, test } from "vitest"
import { checkBash } from "../src/permissions/check.ts"
import { definePermissions } from "../src/permissions/index.ts"
import { parseBash } from "../src/permissions/parser.ts"
import bash from "./bash.json" with { type: "json" }

/**
 * Coverage report against the recorded session corpus. This isn't a
 * pass/fail style assertion — it's a snapshot of what fraction of
 * real LLM-driven commands fall into each verdict bucket given the
 * `readonly` preset (Zaly's default). Adjust the preset itself or
 * supply rule overrides via `presetPolicy(...)` to see the impact.
 */

// Use the shipped readonly preset as-is, but allow file reads anywhere
// for the snapshot — most of the corpus reads files outside cwd
// (absolute paths in /home/...) which would otherwise force ask.
const policy = definePermissions({
  preset: "permissive",
  fileRead: () => "allow",
})

describe("permissions: bash.json corpus coverage", () => {
  test("compute and log verdict distribution", () => {
    const stats = { allow: 0, ask: 0, deny: 0 }
    const parseFails = 0
    /** Histogram of blocking commands: `cmd subcmd` → { count, example }.
     *  Aggregating by command makes it obvious which rules to add next. */
    const blockers = new Map<string, { count: number; example: string }>()
    let unparseable = 0
    let unparseableExample = ""

    for (const { command } of bash) {
      const r = checkBash(command, policy)
      stats[r.verdict]++

      if (r.verdict === "allow") continue

      if (r.blocker) {
        const key = blockerKey(r.blocker.cmd, r.blocker.args)
        const prev = blockers.get(key)
        if (prev) prev.count++
        else blockers.set(key, { count: 1, example: command })
      } else {
        // No blocker = parse failure (e.g. heredoc).
        unparseable++
        if (unparseableExample === "") unparseableExample = command
      }
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
    // Quiet the unused-binding warning while keeping `parseBash` available
    // if someone wants to drop a focused parse-only check later.
    void parseFails
    void parseBash
  })
})

/** Group key for a blocking segment. `cmd subcmd` when the first arg
 *  is a plausible subcommand (no leading dash/slash, no globs); else
 *  just `cmd`. Keeps the histogram readable without over-collapsing. */
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
