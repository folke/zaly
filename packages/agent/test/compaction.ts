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

import type { CompactionContext } from "../src/compaction/compactions.ts"
import type { BashUsage, FileUsage } from "../src/compaction/utils.ts"

import { since } from "@zaly/shared"
import {
  extractBashUsage,
  extractConversation,
  extractFileUsage,
  extractUserMessages,
  messageTail,
} from "../src/compaction/utils.ts"
import { loadSession } from "./helpers.ts"

const lastCol = (lastTurn: number, lastTs: number): string => {
  const turn = lastTurn === Infinity ? "?" : `${lastTurn}t`
  const wall = lastTs > 0 ? since(lastTs) : "?"
  return `${turn} / ${wall}`
}

function formatBashCommands(commands: BashUsage[]): string {
  if (commands.length === 0) return "(no bash commands found)"
  const lines: string[] = []
  lines.push("=== Top bash commands (sorted by frecency) ===")
  lines.push(`  ${"score".padStart(7)}  ${"count".padStart(5)}  ${"last".padEnd(14)}  command`)
  for (const c of commands) {
    lines.push(
      `  ${c.score.toFixed(2).padStart(7)}  ${String(c.count).padStart(5)}  ${lastCol(c.lastTurn, c.lastTs).padEnd(14)}  ${c.command}`
    )
  }
  return lines.join("\n")
}

function formatFileTouches(files: FileUsage[]): string {
  if (files.length === 0) return "(no file ops found)"
  const lines: string[] = []
  lines.push("=== Top files touched (sorted by frecency) ===")
  lines.push(
    `  ${"score".padStart(7)}  ${"total".padStart(5)}  r/w/e         ${"last".padEnd(14)}  path`
  )
  for (const f of files) {
    const rwe = `${f.reads}/${f.writes}/${f.edits}`.padEnd(12)
    lines.push(
      `  ${f.score.toFixed(2).padStart(7)}  ${String(f.count).padStart(5)}  ${rwe}  ${lastCol(f.lastTurn, f.lastTs).padEnd(14)}  ${f.path}`
    )
  }
  return lines.join("\n")
}

function formatTranscript(transcript: string, tailLength: number): string {
  const header = [
    "=== Chat transcript (tail, maxTokens=20k) ===",
    `tail length: ${tailLength} messages`,
    `transcript length: ${transcript.length.toLocaleString()} chars (~${Math.ceil(transcript.length / 4).toLocaleString()} tokens)`,
  ].join("\n")
  return `${header}\n\n${transcript}`
}

const DEFAULT_SESSION =
  "~/.claude/projects/-home-folke-projects-zaly/01e44572-4bc9-43c6-863b-92e31190f95f.jsonl"

const path = process.env.SESSION ?? DEFAULT_SESSION
const session = await loadSession(path)

const tail = await messageTail({ session, messages: session.messages }, { keepTokens: 20_000 })
// let older = session.messages.slice(0, -tail.length)
// the above is what should be used, but for testing, just take last 100
const messages = session.messages //.slice(-500)
const ctx: CompactionContext = {
  session,
  messages,
}

console.log(`loaded ${messages.length} messages from ${path}\n`)

console.log(formatBashCommands(extractBashUsage(ctx)))
console.log()
console.log(formatFileTouches(await extractFileUsage(ctx)))
console.log()

// console.log(formatTranscript(extractConversation({ session, messages }), tail.length))
//
// console.log(formatTranscript(extractUserMessages({ session, messages }), tail.length))
