// oxlint-disable no-await-in-loop
import type { Attachment, Content, Message } from "@zaly/ai"

import {
  attachmentToMeta,
  compressImages,
  ContentTransform,
  errorToMeta,
  inlineFileSources,
  metaToText,
  sanitizeText,
  truncateText,
} from "@zaly/ai"

// ── token estimation ───────────────────────────────────────────────────

const CHARS_PER_TOKEN = 4

const ATTACHMENT_TOKENS: Record<Attachment["type"], number> = {
  audio: 3000,
  image: 1500,
  pdf: 8000,
  video: 5000,
}

const transform = ContentTransform.create()
  .pipe(attachmentToMeta("audio", "video"))
  .pipe(inlineFileSources())
  .pipe(compressImages())
  .pipe(errorToMeta())
  .pipe(metaToText())
  .pipe(sanitizeText())
  .pipe(truncateText())

function fromText(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

function estimateContent(content: Content): number {
  if (typeof content === "string") return fromText(content)
  let total = 0
  for (const p of content) total += estimatePart(p)
  return total
}

function estimatePart(p: Message["content"][number]): number {
  if (!p || typeof p !== "object") return 0
  const part = p
  switch (part.type) {
    case "reasoning":
    case "text": {
      return fromText(part.text)
    }
    case "tool-call": {
      return fromText(part.name) + fromText(JSON.stringify(part.params ?? {}))
    }
    case "tool-result": {
      return fromText(part.name) + estimateContent(part.content)
    }
    case "image":
    case "pdf":
    case "audio":
    case "video": {
      return ATTACHMENT_TOKENS[part.type]
    }
    default: {
      // meta, error, unknown — JSON-stringify length / 4
      return fromText(safeJson(part))
    }
  }
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

export async function tokenStats(msgs: readonly Message[]): Promise<Stats> {
  const byRole = new Map<string, Map<string, Bucket>>()
  const total: Bucket = { count: 0, tokens: 0 }
  for (let m of msgs) {
    const tm = await transform.runMessage(m)
    if (!tm) continue
    m = tm
    const role = byRole.get(m.role) ?? new Map<string, Bucket>()
    byRole.set(m.role, role)
    if (typeof m.content === "string") {
      const t = fromText(m.content)
      bump(role, "text", t)
      total.tokens += t
      total.count += 1
      continue
    }
    for (const p of m.content) {
      const t = estimatePart(p)
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

export function formatTokenStats(s: Stats): string {
  const ret: string[] = []
  const roles = [...s.byRole.keys()].toSorted()
  for (const role of roles) {
    const parts = s.byRole.get(role)!
    const roleTotal = sumBuckets(parts)
    ret.push(line(role, roleTotal))
    const types = [...parts.entries()].toSorted((a, b) => b[1].tokens - a[1].tokens)
    for (const [type, b] of types) ret.push(line(`  ${type}`, b))
  }
  ret.push("─".repeat(46))
  ret.push(line("TOTAL", s.total))
  return ret.join("\n")
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
