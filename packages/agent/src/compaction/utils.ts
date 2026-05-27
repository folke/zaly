import type { AnyPart, Message } from "@zaly/ai"
import type { BashTool } from "../tools/bash.ts"
import type { EditToolMeta } from "../tools/edit.ts"
import type { ReadToolMeta } from "../tools/read.ts"
import type { WriteToolMeta } from "../tools/write.ts"

import {
  attachmentToMeta,
  ContentTransform,
  errorToMeta,
  extractToolCalls,
  extractToolResults,
  metaToText,
  safeParseToolParams,
  sanitizeText,
  stringifyContent,
  toXml,
} from "@zaly/ai"
import { safeStringify, formatDuration } from "@zaly/shared"
import { parseBash } from "../utils/bash/parser.ts"
import { TOOLS } from "../utils/bash/tools.ts"

export type ToolStat = {
  count: number
  score: number
  /** Turns ago at the most recent occurrence (0 = current/last turn).
   *  Use with `lastTs` to give the agent both an "in-experience" recency
   *  signal and a wall-clock staleness signal. */
  lastTurn: number
  /** Wall-clock ms timestamp of the most recent occurrence. `0` if no
   *  occurrence carried a timestamp. */
  lastTs: number
}

/** Per-file activity tally produced by `extractFiles`. Each entry is a
 *  path that the agent touched, with per-kind counts and a frecency
 *  `score` that downweights older touches and weights writes/edits
 *  more than reads. Sort the top-N by `score` to surface the active
 *  working set; `reads` / `writes` / `edits` give the per-kind detail
 *  for display. */
export type FileUsage = ToolStat & {
  path: string
  reads: number
  writes: number
  edits: number
}

/** Per-command activity tally produced by `extractBashCommands`. `count`
 *  is raw invocations; `score` is the same number but exp-decay-weighted
 *  by turn distance from the end of the conversation, so recently-used
 *  commands rank above old hot ones. */
export type BashUsage = ToolStat & {
  command: string
}

// ── Frecency tuning ───────────────────────────────────────────────────
// Half-life measured in user turns, not wall time — what matters for
// compaction context is what's been hot in the agent's *recent
// experience*, regardless of how long the user spent between turns.
// 60 turns is a middle ground: actively-iterated work stays at the top
// while recurring workflow patterns (git stash, test-runner flags) still
// clear the minScore filter instead of getting buried under one-shot
// noise from earlier in the session.
const HALF_LIFE_TURN = 60
const LAMBDA = Math.LN2 / HALF_LIFE_TURN
// Per-kind weights — writes are the strongest intent signal (full-file
// authorship), edits the iteration signal, reads the informational one.
const KIND_WEIGHTS = { edit: 2, read: 1, write: 3 } as const

export type ToolStatOptions = {
  minCount?: number
  minScore?: number
  limit?: number
  sort?: "score" | "count" | "key"
}

const sorters = {
  count: (a: [string, ToolStat], b: [string, ToolStat]) => b[1].count - a[1].count,
  key: (a: [string, ToolStat], b: [string, ToolStat]) => a[0].localeCompare(b[0]),
  score: (a: [string, ToolStat], b: [string, ToolStat]) => b[1].score - a[1].score,
} as const satisfies Record<string, (a: [string, ToolStat], b: [string, ToolStat]) => number>

function turnInfo(messages: readonly Message[]) {
  const weights: number[] = []
  const turns: number[] = []
  let turn = 0
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.role === "user") turn++
    weights[i] = Math.exp(-LAMBDA * turn)
    turns[i] = turn
  }
  return { turns, weights }
}

function toolStats<T extends ToolStat = ToolStat>(
  map: Map<string, T>,
  opts: ToolStatOptions = {}
): T[] {
  const limit = opts.limit ?? 50
  const sorter = sorters[opts.sort ?? "score"]
  const sorted = [...map.entries()].toSorted(sorter).map(([_, stat]) => stat)
  return sorted
    .filter((stat) => stat.count >= (opts.minCount ?? 1))
    .filter((stat) => stat.score >= (opts.minScore ?? 0))
    .slice(0, limit)
}

/** Walk assistant tool-calls for `read` / `write` / `edit` and tally
 *  per-path activity with frecency-weighted scoring. Returns the top-N
 *  by score. Each entry carries the per-kind breakdown so the
 *  summarizer can describe the *kind* of activity ("heavily edited",
 *  "read once, then written", "iteratively refined").
 *
 *  Paths are canonicalized via the cwd recorded on each call's session
 *  node — relative paths are resolved against the cwd that was active
 *  when the call ran, and `~` is expanded. Calls under different cwds
 *  that target the same file thus collapse into one bucket. */
export function extractFileUsage(
  messages: readonly Message[],
  opts: ToolStatOptions = {}
): FileUsage[] {
  opts = { minScore: 0.5, ...opts }
  const map = new Map<string, FileUsage>()
  const { turns, weights } = turnInfo(messages)

  for (const { m: m, p: p, $m: idx } of extractToolResults<
    EditToolMeta | ReadToolMeta | WriteToolMeta
  >(messages, ["read", "write", "edit"])) {
    const path = p.meta?.path
    if (!path) continue
    const entry = map.get(path) ?? {
      count: 0,
      edits: 0,
      lastTs: 0,
      lastTurn: Infinity,
      path,
      reads: 0,
      score: 0,
      writes: 0,
    }
    if (p.name === "read") entry.reads++
    else if (p.name === "write") entry.writes++
    else entry.edits++
    entry.count++
    entry.score += weights[idx] * KIND_WEIGHTS[p.name as keyof typeof KIND_WEIGHTS]
    if (turns[idx] < entry.lastTurn) entry.lastTurn = turns[idx]
    if (m.ts && m.ts > entry.lastTs) entry.lastTs = m.ts
    map.set(path, entry)
  }
  return toolStats(map, opts)
}

/** Walk assistant tool-calls for `bash`, parse each command line, and
 *  tally per-command frecency. Plumbing commands (cat, head, grep, awk,
 *  sed, …) are filtered out — they dominate raw counts but carry no
 *  operational signal a summarizer would describe. Returns the top-N
 *  by frecency `score`. */
export function extractBashUsage(
  messages: readonly Message[],
  opts: ToolStatOptions = {}
): BashUsage[] {
  opts = { minCount: 2, minScore: 0.5, ...opts } // bash commands are noisier, so default to minCount=2
  const { turns, weights } = turnInfo(messages)
  const map = new Map<string, BashUsage>()
  for (const { m: m, p: p, $m: idx } of extractToolCalls(messages, ["bash"])) {
    const params = safeParseToolParams<BashTool>(p.params)
    const cmd = params?.command
    if (!cmd) continue
    const result = parseBash(cmd)
    if (!result.ok) continue
    const w = weights[idx] ?? 0
    const t = turns[idx] ?? Infinity
    for (const seg of result.segments) {
      if (TOOLS[seg.cmd]) continue
      const key = `${seg.cmd} ${seg.args.join(" ")}`
      if (key.includes("\n")) continue
      const entry = map.get(key) ?? {
        command: key,
        count: 0,
        lastTs: 0,
        lastTurn: Infinity,
        score: 0,
      }
      entry.count++
      entry.score += w
      if (t < entry.lastTurn) entry.lastTurn = t
      if (m.ts && m.ts > entry.lastTs) entry.lastTs = m.ts
      map.set(key, entry)
    }
  }
  return toolStats(map, opts)
}

// ── Transcript ────────────────────────────────────────────────────────

function truncate(text: string, len: number): string {
  return text.length <= len ? text : `${text.slice(0, len)}…`
}

/** Flatten a list of messages into a single tagged transcript. */
export function extractConversation(
  messages: readonly Message[],
  opts: { maxToolResultLen?: number } = {}
): string {
  const transform = ContentTransform.create<AnyPart>()
    .drop("reasoning")
    .map("tool-call", (part) => ({
      content: [
        {
          text: `${part.name}(${safeStringify(part.params)})`,
          type: "text" as const,
        },
      ],
      tag: "tool-call",
      type: "meta",
    }))
    .map("tool-result", (part) => {
      const text = truncate(stringifyContent(part.content), opts.maxToolResultLen ?? 2000)
      return {
        content: text === "" ? undefined : [{ text, type: "text" as const }],
        data: { tool: part.name, ...(part.isError ? { error: true } : {}) },
        tag: "tool-result",
        type: "meta" as const,
      }
    })
    .pipe(attachmentToMeta("image", "pdf", "audio", "video"))
    .pipe(errorToMeta())
    .pipe(metaToText())
    .pipe(sanitizeText())

  const blocks: string[] = []
  let role: string | undefined = undefined
  for (const m of messages) {
    const parts =
      typeof m.content === "string" ? [{ text: m.content, type: "text" as const }] : m.content
    const transformed = transform.runSync(parts)
    const text = stringifyContent(transformed).trim()
    if (!text) continue
    let currentRole = m.role.charAt(0).toUpperCase() + m.role.slice(1) // capitalize
    currentRole = currentRole === "Tool" ? "Assistant" : currentRole // re-label "Tool" as "Assistant" for summarization purposes
    blocks.push(role === currentRole ? text : `\n[${currentRole}]: ${text}`)
    role = currentRole
  }
  const text = blocks.join("\n").replace(/^\s+$/gm, "").trim()
  return toXml(text, "conversation", { indent: false })
}

// ── Tail selection ────────────────────────────────────────────────────

export function messageTail(
  messages: readonly Message[],
  opts: { keepTokens?: number }
): Message[] {
  const maxTokens = opts.keepTokens ?? 20_000
  messages = messages.toReversed()
  const tail: Message[] = []
  const queue: Message[] = []

  let used = 0
  let last: number | undefined = undefined

  for (const m of messages) {
    queue.unshift(m)
    const usage = m.role === "assistant" ? m.meta?.usage : undefined
    if (!usage) continue
    const current = usage.input + usage.output + (usage.cacheRead ?? 0) + (usage.cacheWrite ?? 0)
    // clamp for masker and similar events that might shrink the context size
    const delta = Math.max(0, (last ?? current) - current)
    if (used + delta > maxTokens) break
    used += delta
    last = current
    tail.unshift(...queue.splice(0))
  }
  return tail
}

// -- Formatting helpers -────────────────────────────────────────────────────────

const lastCol = (lastTurn: number, lastTs: number): string => {
  const turn = lastTurn === Infinity ? "?" : `${lastTurn}t`
  const wall = lastTs > 0 ? formatDuration(lastTs) : "?"
  return `${turn} / ${wall}`
}

export function formatBashUsage(commands: BashUsage[]): string {
  if (commands.length === 0) return "(no bash commands found)"
  const lines: string[] = []
  lines.push("=== Top bash commands (sorted by frecency) ===")
  lines.push(`  ${"score".padStart(7)}  ${"count".padStart(5)}  ${"last".padEnd(14)}  command`)
  for (const c of commands) {
    lines.push(
      `  ${c.score.toFixed(2).padStart(7)}  ${String(c.count).padStart(5)}  ${lastCol(c.lastTurn, c.lastTs).padEnd(14)}  ${c.command}`
    )
  }
  const text = lines.join("\n")
  return toXml(text, "bash-commands", { indent: false })
}

export function formatFileUsage(files: FileUsage[]): string {
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
  const text = lines.join("\n")
  return toXml(text, "files", { indent: false })
}
