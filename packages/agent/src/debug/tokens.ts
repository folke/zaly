// oxlint-disable no-await-in-loop
import type { Attachment, Content, Message, ToolCallPart, ToolResultPart } from "@zaly/ai"

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
import { fileDetect } from "@zaly/shared/detect"
import { imageInfo } from "@zaly/shared/image"

// ── token estimation ───────────────────────────────────────────────────

const CHARS_PER_TOKEN = 4
const ANTHROPIC_IMAGE_DIVISOR = 750
const PDF_PAGE_BYTES = 50_000 // rough average — text PDFs can be ~10–50 KB/page, image-heavy much more
const PDF_TOKENS_PER_PAGE = 2000

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
      const info = await imageInfo(detected)
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
      bump(role, "string", t)
      total.tokens += t
      total.count += 1
      continue
    }
    for (const p of m.content) {
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
