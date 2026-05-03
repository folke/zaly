/* Manual compaction harness — not a test.
 *
 *   bun packages/agent/test/compaction.ts                          # uses default Claude session
 *   SESSION=/abs/path/to/session.jsonl bun packages/agent/test/compaction.ts
 *
 * Loads a real persisted session and prints summary signals that the
 * compaction prompt would feed into the summarizer:
 *   - Top bash commands by frequency, aggregated at `cmd + args` and
 *     filtered to non-plumbing (no head/tail/cat/grep/…).
 *   - Top files touched, with per-kind read/write/edit breakdown.
 *
 * If the session path looks like a Claude Code session (contains
 * `.claude` in the path), it's converted on the fly via
 * `loadClaudeSession` and the messages are loaded into an empty
 * in-memory zaly Session. Otherwise the path is loaded as a native
 * zaly session JSONL. */

import { since } from "@zaly/shared"
import { extractBashCommands, extractFiles } from "../src/compaction.ts"
import { loadSession } from "./helpers.ts"

const lastCol = (lastTurn: number, lastTs: number): string => {
  const turn = lastTurn === Infinity ? "?" : `${lastTurn}t`
  const wall = lastTs > 0 ? since(lastTs) : "?"
  return `${turn} / ${wall}`
}

const DEFAULT_SESSION =
  "~/.claude/projects/-home-folke-projects-zaly/01e44572-4bc9-43c6-863b-92e31190f95f.jsonl"

const path = process.env.SESSION ?? DEFAULT_SESSION
const session = await loadSession(path)
const messages = [...session.messages]
console.log(`loaded ${messages.length} messages from ${path}\n`)

const commands = extractBashCommands(messages)
if (commands.length === 0) {
  console.log("(no bash commands found)")
} else {
  console.log("=== Top bash commands (sorted by frecency) ===")
  console.log(
    `  ${"score".padStart(7)}  ${"count".padStart(5)}  ${"last".padEnd(14)}  command`
  )
  for (const c of commands) {
    console.log(
      `  ${c.score.toFixed(2).padStart(7)}  ${String(c.count).padStart(5)}  ${lastCol(c.lastTurn, c.lastTs).padEnd(14)}  ${c.command}`
    )
  }
}

console.log()

const files = extractFiles(session)
if (files.length === 0) {
  console.log("(no file ops found)")
} else {
  console.log("=== Top files touched (sorted by frecency) ===")
  console.log(
    `  ${"score".padStart(7)}  ${"total".padStart(5)}  r/w/e         ${"last".padEnd(14)}  path`
  )
  for (const f of files) {
    const rwe = `${f.reads}/${f.writes}/${f.edits}`.padEnd(12)
    console.log(
      `  ${f.score.toFixed(2).padStart(7)}  ${String(f.count).padStart(5)}  ${rwe}  ${lastCol(f.lastTurn, f.lastTs).padEnd(14)}  ${f.path}`
    )
  }
}
