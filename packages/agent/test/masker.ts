/* Manual masker harness — not a test.
 *
 *   bun packages/agent/test/masker.ts                      # uses default Claude session
 *   SESSION=/abs/path/to/session.jsonl bun packages/agent/test/masker.ts
 *
 * Loads a real persisted session, prints an estimated-token breakdown,
 * runs the masker with default settings, and prints the breakdown
 * again so you can see exactly what got compressed and by how much.
 *
 * Token estimates are pragmatic, not exact:
 *   - text: `chars / 4` (rough English-text rule of thumb)
 *   - images: `(width × height) / 750` (Anthropic's image formula —
 *             matches OpenAI's high-detail at typical sizes)
 *   - pdfs: ~2000 per page, with a byte-based page count guess
 *           (~3 KB / page for typical mixed content) */

import { extractConversation } from "../src/compaction/utils.ts"
import { formatTokenStats, tokenStats } from "../src/debug/tokens.ts"
import { Masker } from "../src/masker.ts"
import { loadSession } from "./helpers.ts"

// ── token estimation ───────────────────────────────────────────────────

const DEFAULT_SESSION =
  "~/.local/share/zaly/sessions/+home+folke+projects+zaly/019e45c3-d436-7f1f-9649-f6bffe0e4054/session.jsonl"

const path = process.env.SESSION ?? DEFAULT_SESSION

function printTokenStats(stats: Awaited<ReturnType<typeof tokenStats>>): void {
  console.log(formatTokenStats(stats))
}

const session = await loadSession(path)
const messages = [...session.messages]
console.log(`loaded ${messages.length} messages from ${path}`)

const before = await tokenStats(messages)
const masker = new Masker()
// Force a high-pressure level so the harness always runs the decide
// pass — otherwise low-pressure sessions would render no masks.
const masked = masker.apply(messages, { level: 3, limit: 200_000, ratio: 0.99, used: 198_000 })
const after = await tokenStats(masked)

function fmt(n: number): string {
  return n.toLocaleString()
}
console.log("\n=== BEFORE ===")
printTokenStats(before)
console.log("\n=== AFTER (default masker) ===")
printTokenStats(after)

const saved = before.total.tokens - after.total.tokens
const pct = before.total.tokens === 0 ? 0 : (saved / before.total.tokens) * 100
console.log(
  `\nstamped ${masker.stamped} messages — saved ~${fmt(saved)} tokens (${pct.toFixed(1)}%)`
)

console.log(masker.stats)

// console.log(extractConversation(masked, { maxToolResultLen: 100 }))
