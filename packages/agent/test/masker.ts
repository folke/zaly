/* Manual masker harness — not a test.
 *
 *   bun packages/agent/test/masker.ts                      # uses fixture
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

import type { Attachment, Content, Message, ToolCallPart, ToolResultPart } from "@zaly/ai"

import {
  attachmentToMeta,
  compressImages,
  ContentTransform,
  errorToMeta,
  inlineFileSources,
  isContentPart,
  metaToText,
} from "@zaly/ai"
import { fileDetect, imageInfo } from "@zaly/shared"
import { resolve } from "node:path"
import { Masker } from "../src/masker.ts"
import { Session } from "../src/session/index.ts"

// ── token estimation ───────────────────────────────────────────────────

const CHARS_PER_TOKEN = 4
const ANTHROPIC_IMAGE_DIVISOR = 750
const PDF_PAGE_BYTES = 50_000 // rough average — text PDFs can be ~10–50 KB/page, image-heavy much more
const PDF_TOKENS_PER_PAGE = 2000

const path = process.env.SESSION ?? resolve(import.meta.dirname, "fixtures/masker-session.jsonl")
const anthropicTransform = ContentTransform.create()
  .pipe(attachmentToMeta("audio", "video"))
  .pipe(inlineFileSources())
  .pipe(compressImages())
  .pipe(errorToMeta())
  .pipe(metaToText())

const session = await Session.load({ path })
const messages = [...session.messages]
console.log(`loaded ${messages.length} messages from ${path}`)

const before = await stats(messages)
const masker = new Masker()
// Force a high-pressure level so the harness always runs the decide
// pass — otherwise low-pressure sessions would render no masks.
const after = await stats(
  masker.apply(messages, { level: 3, limit: 200_000, ratio: 0.99, used: 198_000 })
)

console.log("\n=== BEFORE ===")
print(before)
console.log("\n=== AFTER (default masker) ===")
print(after)

const saved = before.total.tokens - after.total.tokens
const pct = before.total.tokens === 0 ? 0 : (saved / before.total.tokens) * 100
console.log(
  `\nstamped ${masker.stamped} messages — saved ~${fmt(saved)} tokens (${pct.toFixed(1)}%)`
)

function fromText(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

async function estimateContent(content: Content): Promise<number> {
  if (typeof content === "string") return fromText(content)
  let total = 0
  for (const p of content) total += await estimatePart(p)
  return total
}

async function estimatePart(p: unknown): Promise<number> {
  if (!p || typeof p !== "object") return 0
  const part = p as { type?: string }
  switch (part.type) {
    case "text": {
      return fromText((part as { text: string }).text)
    }
    case "reasoning": {
      return fromText((part as { text: string }).text)
    }
    case "tool-call": {
      const tc = part as ToolCallPart
      return fromText(tc.name) + fromText(JSON.stringify(tc.params ?? {}))
    }
    case "tool-result": {
      const tr = part as ToolResultPart
      return fromText(tr.name) + (await estimateContent(tr.content))
    }
    case "image":
    case "pdf":
    case "audio":
    case "video": {
      return await estimateAttachment(part as Attachment)
    }
    default: {
      // meta, error, unknown — JSON-stringify length / 4
      return fromText(safeJson(part))
    }
  }
}

async function estimateAttachment(att: Attachment): Promise<number> {
  if (att.source.type !== "base64") return 0
  if (att.type === "pdf") return 0
  const detected = await fileDetect({ base64: att.source.data, mime: att.mime })
  if (!detected) return 0
  if (detected.type === "image") {
    try {
      const info = imageInfo(detected)
      return Math.ceil((info.width * info.height) / ANTHROPIC_IMAGE_DIVISOR)
    } catch {
      return 0
    }
  }
  if (detected.type === "pdf") {
    const pages = Math.max(1, Math.round(detected.data.length / PDF_PAGE_BYTES))
    return pages * PDF_TOKENS_PER_PAGE
  }
  return 0
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v)
  } catch {
    return ""
  }
}

// ── stats ──────────────────────────────────────────────────────────────

interface Bucket {
  count: number
  tokens: number
}
interface Stats {
  byRole: Map<string, Map<string, Bucket>>
  total: Bucket
}

async function stats(msgs: readonly Message[]): Promise<Stats> {
  const byRole = new Map<string, Map<string, Bucket>>()
  const total: Bucket = { count: 0, tokens: 0 }
  for (const m of msgs) {
    const role = byRole.get(m.role) ?? new Map<string, Bucket>()
    byRole.set(m.role, role)
    if (typeof m.content === "string") {
      const t = fromText(m.content)
      bump(role, "string", t)
      total.tokens += t
      total.count += 1
      continue
    }
    const parts = await Promise.all(
      m.content.map(async (p) =>
        isContentPart(p) ? anthropicTransform.run([p]).then((r) => r[0]) : p
      )
    )
    for (const p of parts) {
      const t = await estimatePart(p)
      const key =
        p.type === "tool-result" || p.type === "tool-call" ? `${p.type}:${p.name}` : p.type
      bump(role, key, t)
      total.tokens += t
      total.count += 1
    }
  }
  return { byRole, total }
}

function bump(m: Map<string, Bucket>, k: string, tokens: number): void {
  const e = m.get(k) ?? { count: 0, tokens: 0 }
  e.tokens += tokens
  e.count += 1
  m.set(k, e)
}

// ── print ──────────────────────────────────────────────────────────────

function print(s: Stats): void {
  const roles = [...s.byRole.keys()].toSorted()
  for (const role of roles) {
    const parts = s.byRole.get(role)!
    const roleTotal = sumBuckets(parts)
    console.log(line(role, roleTotal))
    const types = [...parts.entries()].toSorted((a, b) => b[1].tokens - a[1].tokens)
    for (const [type, b] of types) console.log(line(`  ${type}`, b))
  }
  console.log("─".repeat(46))
  console.log(line("TOTAL", s.total))
}

function sumBuckets(m: Map<string, Bucket>): Bucket {
  let tokens = 0
  let count = 0
  for (const b of m.values()) {
    tokens += b.tokens
    count += b.count
  }
  return { count, tokens }
}

function line(label: string, b: Bucket): string {
  return `${label.padEnd(28)} ${String(b.count).padStart(6)}x ${fmt(b.tokens).padStart(14)}`
}

function fmt(n: number): string {
  return n.toLocaleString()
}
