import type { Attachment, Message } from "@zaly/ai"

import { stringifyContent } from "@zaly/ai"

export type AnyType =
  | Message["role"]
  | Extract<Message["content"][number], { type: string }>["type"]
  | "content"
  | "string"

export type AnyContent = Message["content"]
export type AnyPart = Exclude<AnyContent[number], string>

export type TokenCount = {
  type: AnyType
  name?: string
  tokens: number
  children?: TokenCount[]
}

export type TokenStats = {
  key: string
  tokens: number
  count: number
  children?: Map<string, TokenStats>
}

// ── token estimation ───────────────────────────────────────────────────

const CHARS_PER_TOKEN = 4

const ATTACHMENT_TOKENS: Record<Attachment["type"], number> = {
  audio: 3000,
  image: 1500,
  pdf: 8000,
  video: 5000,
}

function fromText(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

function sumTokens(stats: TokenCount[]): number {
  return stats.reduce((sum, s) => sum + s.tokens, 0)
}

function estimatePart(p: AnyPart): TokenCount {
  switch (p.type) {
    case "reasoning":
    case "text": {
      return { tokens: fromText(p.text), type: p.type }
    }
    case "tool-call": {
      return {
        name: p.name,
        tokens: fromText(p.name) + fromText(JSON.stringify(p.params ?? {})),
        type: p.type,
      }
    }
    case "tool-result": {
      const children = estimateContent(p.content)
      return {
        children,
        name: p.name,
        tokens: fromText(p.name) + sumTokens(children),
        type: p.type,
      }
    }
    case "image":
    case "pdf":
    case "audio":
    case "video": {
      return { tokens: ATTACHMENT_TOKENS[p.type], type: p.type }
    }
    case "meta": {
      const children = p.content ? estimateContent(p.content) : undefined
      return {
        children,
        name: p.tag,
        tokens: fromText(stringifyContent(p)),
        type: p.type,
      }
    }
    case "error": {
      return { tokens: fromText(stringifyContent(p)), type: p.type }
    }
    default: {
      // @ts-expect-error: exhaustive check
      throw new Error(`Unknown part type: ${p.type}`)
    }
  }
}

function estimateContent(content: AnyContent): TokenCount[] {
  if (typeof content === "string") return [{ tokens: fromText(content), type: "text" }]
  let tokens = 0
  const children: TokenCount[] = []
  for (const p of content) {
    const partStats = estimatePart(p)
    tokens += partStats.tokens
    children.push(partStats)
  }
  return children
}

function estimateMessage(m: Message): TokenCount {
  const type = m.role
  const children = estimateContent(m.content)
  return {
    children,
    tokens: sumTokens(children),
    type,
  }
}

function addCount(stat: TokenCount, parent: TokenStats): void {
  const key = stat.name ? `${stat.type}:${stat.name}` : stat.type
  parent.children ??= new Map()
  let child = parent.children.get(key)
  if (!child) {
    child = { children: new Map(), count: 0, key, tokens: 0 }
    parent.children.set(key, child)
  }
  child.tokens += stat.tokens
  child.count++
  if (stat.children) {
    for (const c of stat.children) addCount(c, child)
  }
}

export function tokenStats(msgs: readonly Message[]): TokenStats {
  const root: TokenStats = { children: new Map(), count: 0, key: "TOTAL", tokens: 0 }
  for (const m of msgs) {
    const stats = estimateMessage(m)
    root.tokens += stats.tokens
    root.count++
    addCount(stats, root)
  }
  return root
}

// ── stats ──────────────────────────────────────────────────────────────

function fmtStats(s: TokenStats, indent = 0): string {
  const header = "  ".repeat(indent) + s.key
  return `${header.padEnd(28)} ${fmt(s.count).padStart(6)}x ${fmt(s.tokens).padStart(14)}`
}

export function formatTokenStats(s: TokenStats, indent = 0): string {
  const ret: string[] = []
  const children = s.children
    ? [...s.children.values()].toSorted((a, b) => b.tokens - a.tokens)
    : []
  for (const c of children) {
    ret.push(fmtStats(c, indent))
    if (c.children?.size) ret.push(formatTokenStats(c, indent + 1))
    if (indent === 0) ret.push("─".repeat(51))
  }
  if (indent === 0) {
    ret.unshift("─".repeat(51))
    ret.push(fmtStats(s, indent))
    ret.push("─".repeat(51))
  }
  return ret.join("\n")
}

function fmt(n: number): string {
  return n.toLocaleString()
}
