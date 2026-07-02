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

import { formatTokenStats, tokenStats } from "../src/context/tokens.ts"
import { createAgent } from "../src/ctx.ts"
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
const agent = await createAgent({ session })

// const scoring = new ContextScoring()
// const scores = scoring.score(messages)
//
// for (const s of scores) {
//   for (const p of s.parts) {
//     let name = `${p.message.role}:${p.part.type}`
//     if (p.part.type === "tool-result" || p.part.type === "tool-call") {
//       name = `tool:${p.part.name}:${p.part.type === "tool-result" ? ">" : "<"}`
//     }
//     console.log(`${name.padEnd(20)} ${p.score.toFixed(2).padStart(5)}   ${s.key.slice(0, 200)}`)
//   }
// }

const before = tokenStats(messages)
const masker = new Masker(agent)
// Force a high-pressure level so the harness always runs the decide
// pass — otherwise low-pressure sessions would render no masks.
const limit = 270_000
const used = 170_000

const masked = await masker.mask(messages, { limit, ratio: used / limit })
const after = tokenStats(masked)

function fmt(n: number): string {
  return n.toLocaleString()
}
console.log("\n=== BEFORE ===")
printTokenStats(before)
console.log("\n=== AFTER (default masker) ===")
printTokenStats(after)

const saved = before.tokens - after.tokens
const pct = before.tokens === 0 ? 0 : (saved / before.tokens) * 100
console.log(
  `\nstamped ${masker.masked} messages — saved ~${fmt(saved)} tokens (${pct.toFixed(1)}%)`
)

console.log(masker.stats)

// console.log(extractConversation(masked, { maxToolResultLen: 100 }))
