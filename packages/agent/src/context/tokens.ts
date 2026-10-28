import type {
  AnyPart,
  AnyType,
  Attachment,
  Message,
  ModelSpec,
  ReasoningEffort,
  ReasoningPart,
  Tool,
} from "@zaly/ai"
import type { Prompt } from "../prompt/registry.ts"

import { resolveReasoning, stringifyContent } from "@zaly/ai"

export type TokenContext = {
  reasoning?: ReasoningEffort | boolean
  model?: ModelSpec
}

export type MessageTokenContext = TokenContext & {
  message?: Message
}

export type TokenCount = {
  type: AnyType | Message["role"] | "prompt" | "tool-schema" | "system-prompt"
  kind?: string
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

function estimateReasoning(part: ReasoningPart, ctx: MessageTokenContext): number {
  let reasoning = ctx.reasoning
  if (ctx.model) {
    let requested: ReasoningEffort = "medium"
    if (typeof reasoning === "string") requested = reasoning
    else if (reasoning === false) requested = "off"
    reasoning = resolveReasoning(ctx.model, requested)
  }
  const enabled =
    reasoning !== "off" && reasoning !== false && (!ctx.model || ctx.model.reasoning === true)
  if (!enabled) return 0

  if (ctx.message?.role === "assistant") {
    // Reasoning parts are for the same model?
    if (ctx.model && ctx.message.meta?.modelId !== ctx.model.id) return 0

    const parts = Array.isArray(ctx.message.content)
      ? ctx.message.content.filter((p) => p.type === "reasoning")
      : []

    // Sanity check
    if (!parts.includes(part)) throw new Error("Reasoning part not found in message content")

    const signed = parts.filter((p) => p.signature)
    const reported = ctx.message.meta?.usage?.reasoning

    // If the reasoning part is signed, and the message has a reported reasoning token count,
    // attribute the reported reasoning token count to the first signed reasoning part.
    if (signed.length && reported !== undefined && Number.isFinite(reported) && reported >= 0) {
      const first = signed.at(0)
      if (part !== first) return 0
      return reported
    }
  }

  // If the reasoning part is not signed, or the message does not have a reported reasoning token count,
  // estimate the token count based on the text length.
  return fromText(part.text)
}

export function estimatePart(p: AnyPart, ctx: MessageTokenContext = {}): TokenCount {
  switch (p.type) {
    case "reasoning": {
      return { tokens: estimateReasoning(p, ctx), type: p.type }
    }
    case "text": {
      return { tokens: fromText(p.text), type: p.type }
    }
    case "tool-call": {
      return {
        kind: p.name,
        tokens: fromText(p.name) + fromText(JSON.stringify(p.params ?? {})),
        type: p.type,
      }
    }
    case "tool-result": {
      const children = estimateContent(p.content, ctx)
      return {
        children,
        kind: p.name,
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
      const children = p.content ? estimateContent(p.content, ctx) : undefined
      return {
        children,
        kind: p.tag,
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

function estimateContent(
  content: string | readonly AnyPart[],
  ctx: MessageTokenContext
): TokenCount[] {
  if (typeof content === "string") return [{ tokens: fromText(content), type: "text" }]
  let tokens = 0
  const children: TokenCount[] = []
  for (const p of content) {
    const partStats = estimatePart(p, ctx)
    tokens += partStats.tokens
    children.push(partStats)
  }
  return children
}

function estimateMessage(m: Message, ctx: TokenContext): TokenCount {
  const type = m.role
  const children = estimateContent(m.content, { ...ctx, message: m })
  const kind = m.role === "system" ? m.meta?.kind : undefined
  return {
    children,
    kind,
    tokens: sumTokens(children),
    type,
  }
}

function estimatePrompt(prompt: (string | Prompt<string>)[], tools?: Tool[]): TokenCount {
  const children: TokenCount[] = prompt.map((p) => ({
    kind: typeof p === "string" ? undefined : p.name,
    tokens: fromText(typeof p === "string" ? p : p.text),
    type: "prompt" as const,
  }))
  children.push(
    ...(tools?.map((t) => ({
      kind: t.name,
      tokens: fromText(t.name) + fromText(t.desc ?? "") + fromText(JSON.stringify(t.params ?? {})),
      type: "tool-schema" as const,
    })) ?? [])
  )
  return {
    children,
    tokens: sumTokens(children),
    type: "system-prompt" as const,
  }
}

function addCount(stat: TokenCount, parent: TokenStats, expand?: (c: TokenCount) => boolean): void {
  const keys = stat.kind ? [stat.type, stat.kind] : [stat.type]
  let child: TokenStats | undefined

  for (const key of keys) {
    parent.children ??= new Map()
    child = parent.children.get(key)
    if (!child) {
      child = { children: new Map(), count: 0, key, tokens: 0 }
      parent.children.set(key, child)
    }
    child.tokens += stat.tokens
    child.count++
    parent = child
  }

  if (stat.children && child && (!expand || expand(stat))) {
    for (const c of stat.children) addCount(c, child, expand)
  }
}

export function tokenStats(
  msgs: readonly Message[],
  opts: {
    prompt?: (string | Prompt<string>)[]
    tools?: Tool[]
    expand?: (c: TokenCount) => boolean
  } & TokenContext = {}
): TokenStats {
  const root: TokenStats = { children: new Map(), count: 0, key: "TOTAL", tokens: 0 }
  const counts: TokenCount[] = []
  if (opts.prompt || opts.tools) counts.push(estimatePrompt(opts.prompt ?? [], opts.tools))
  counts.push(...msgs.map((message) => estimateMessage(message, opts)))
  for (const stats of counts) {
    root.tokens += stats.tokens
    root.count++
    addCount(stats, root, opts.expand)
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
  return n.toLocaleString("en-US").replace(/,/g, "_")
}
