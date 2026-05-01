import type {
  Attachment,
  Message,
  TextPart,
  ToolCallPart,
  ToolParams,
  ToolResultPart,
} from "@zaly/ai"
import type { EditTool } from "./tools/edit.ts"
import type { AnyTool } from "./tools/index.ts"
import type { ReadTool } from "./tools/read.ts"
import type { WriteTool } from "./tools/write.ts"
import type { ContextPressure } from "./types.ts"

import { hasAttachments, isAttachment } from "@zaly/ai"
import { safeParseJson, safeStringify } from "@zaly/shared"

/** Unified mask rule. The bucket key *is* the uniqueness criterion —
 *  every item past the first in a bucket is a duplicate by definition,
 *  and that's the default fire condition. The three knobs adjust how
 *  many duplicates survive and which extra ones to mask:
 *
 *  - `keep`     — floor: keep the next N items per bucket (in addition
 *                 to the always-kept most-recent one).
 *  - `maxAge`   — also mask items older than this (ms wall-clock), even
 *                 if they'd otherwise be inside the keep floor.
 *  - `maxTurns` — same as `maxAge` but counted in trailing user turns. */
export type MaskRule = { keep?: number; maxTurns?: number; maxAge?: number }
/** Per-tool dedupe rule. Multiple rules may apply to the same tool;
 *  each one defines its own bucket and gets evaluated independently. */
export type ToolRule = MaskRule & {
  /** Tool this rule applies to. `"*"` is the wildcard fallback — used
   *  only when no rule has a matching `tool` name for the current
   *  result. */
  tool: AnyTool | "*"
  /** How to derive the dedupe bucket key from a tool call:
   *
   *    - `"name"`  — bucket by tool name only. *Every* call past the
   *      first is a duplicate; useful for "keep last N results of
   *      this tool, regardless of params" (combine with `keep`).
   *    - `"params"` — bucket by `${name}:${json(params)}`. Calls with
   *      identical params share a bucket, so re-runs of the same
   *      command/path/url collapse into duplicates. The default for
   *      the `*` wildcard.
   *    - function — custom keyer returning the suffix to append to
   *      `${name}:`, or `undefined` to skip this rule for this call
   *      (other rules still apply). Use for projecting specific param
   *      keys, e.g. `(p) => p.url` to dedupe fetches by url only. */
  key: "name" | "params" | ((params: Record<string, unknown>) => string | undefined)
}

/** Top-level masking config. */
export type MaskOptions = {
  /** Per-tool rules for non-file tools. The wildcard `"*"` is the
   *  fallback; `false` exempts a tool from masking entirely. */
  tools?: ToolRule[] | false
  /** File-aware staleness — keep counts of stale ops to retain per
   *  path, per kind. "Stale" means a later write/edit happened on the
   *  same path (or, for reads, a later full-read subsumed it). Current
   *  ops are working memory and never masked. */
  files?: { read?: number; write?: number; edit?: number } | false
  /** Attachment masking (image / pdf / audio / video). All attachments
   *  beyond the most-recent are mask candidates; `keep` retains a floor
   *  of N more, and `maxAge` / `maxTurns` also mask items older than
   *  the limit (even if they'd be inside the floor). */
  attachments?: MaskRule | false
  /** Don't mask tool-result parts whose original content is shorter
   *  than this (JSON-serialized chars). Skips tiny "ok"-style success
   *  messages where the stub would be larger than the original.
   *  Doesn't apply to attachments (always worth masking). */
  minChars?: number
}

export type ResolvedMaskOptions = {
  tools: Exclude<MaskOptions["tools"], false>
  files: Exclude<MaskOptions["files"], false>
  attachments: Exclude<MaskOptions["attachments"], false>
  minChars: number
}

const defaults = {
  attachments: { keep: 10, maxAge: 24 * 60 * 60 * 1000 },
  files: { edit: 10, read: 2, write: 3 },
  minChars: 500,
  tools: [{ keep: 0, key: "params", tool: "*" }],
} as const satisfies ResolvedMaskOptions

/** In-place mask projection for the request stream.
 *
 *  Single backward walk over messages. As we scan from newest to
 *  oldest, the first occurrence of any tool-result on a path / dedupe
 *  bucket *is* the most recent (the "current"); subsequent encounters
 *  are older / duplicates / stale. State Maps (`#files`, `#buckets`,
 *  `#attachmentsSeen`) accumulate during the walk so each part can
 *  decide on the spot whether to mask, without a separate collect pass.
 *
 *  Cache safety:
 *    - Stable stub bytes (pure function of the call).
 *    - One-way per-(message, part) stamping; once placed, never lifted.
 *    - File-current ops always preserved.
 *
 *  Identity is `Message.id`. Hand-built messages without `id` pass
 *  through unmasked. */
export class Masker {
  readonly #opts: ResolvedMaskOptions
  readonly #stamped = new Map<string, Set<number>>()

  /** Highest pressure level we've decided at. Monotonic up; resets only
   *  when current level falls back to `0` (e.g. after compaction). */
  #pressureLevel = 0

  // Per-apply scan state. Cleared at the top of every `#decide()`.
  #callIndex = new Map<string, ToolCallPart>()
  #callLocations = new Map<string, CallLocation>()
  #files = new Map<string, FileState>()
  #buckets = new Map<string, BucketState>()
  #decisions = new Map<string, Set<number>>()
  #turns = new Map<string, number>()
  #now = 0
  #messages = new Map<string, Message>()

  constructor(opts: MaskOptions = {}) {
    function getOpt<T extends "files" | "attachments">(k: T): ResolvedMaskOptions[T] {
      return opts[k] === false ? undefined : { ...defaults[k], ...opts[k] }
    }
    this.#opts = {
      attachments: getOpt("attachments"),
      files: getOpt("files"),
      minChars: opts.minChars ?? defaults.minChars,
      tools: opts.tools === false ? undefined : (opts.tools ?? defaults.tools),
    }
  }

  /** Number of messages with at least one stamped part. */
  get stamped(): number {
    return this.#stamped.size
  }

  /** Apply the masker to `messages` and return the projected array.
   *
   *  Two phases, gated by `pressure.level`:
   *    1. **Decide** — only when pressure rises to a new level (or on
   *       the very first call). Walks messages, finds new mask
   *       candidates, stamps them. Causes cache invalidation from the
   *       earliest new stamp forward, so we want this rare.
   *    2. **Render** — every call. Walks messages once and applies
   *       previously-stamped masks. Cheap; doesn't change prefix bytes
   *       beyond what the previous decide already committed. */
  apply(messages: readonly Message[], pressure: ContextPressure): Message[] {
    // Always rebuild the call index — render needs it for stub
    // generation, and it's cheap (one forward walk over assistant
    // messages).
    this.#buildCallIndex(messages)
    if (pressure.level > this.#pressureLevel) {
      this.#decide(messages)
      this.#pressureLevel = pressure.level
    } else if (pressure.level === 0) {
      // Reset only on a full clear (e.g. after compaction); intermediate
      // dips don't drop us back so flicker around a threshold doesn't
      // re-fire decide.
      this.#pressureLevel = 0
    }
    return this.#render(messages)
  }

  /** Single forward walk over assistant messages — populates both the
   *  `id → ToolCallPart` index (used by decide for params and by render
   *  for stub text) and the `id → location` index (used by
   *  write/edit propagation in decide). */
  #buildCallIndex(messages: readonly Message[]): void {
    this.#callIndex.clear()
    this.#callLocations.clear()
    for (const m of messages) {
      if (m.role !== "assistant" || typeof m.content === "string" || !m.id) continue
      for (let pi = 0; pi < m.content.length; pi++) {
        const p = m.content[pi]
        if (p.type !== "tool-call") continue
        this.#callIndex.set(p.id, p)
        this.#callLocations.set(p.id, { msgId: m.id, partIdx: pi })
      }
    }
  }

  /** Full analysis pass — backward walk, propagate, filter. Mutates
   *  `#stamped` with new decisions. Called only when we actually want
   *  to commit a cache-invalidation event. */
  #decide(messages: readonly Message[]): void {
    this.#prepare(messages)
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i]
      if (m.role === "user") this.#walkUser(m)
      else if (m.role === "tool") this.#walkTool(m)
    }
    propagateWriteEditCalls(this.#messages, this.#decisions, this.#callLocations)
    this.#filterMinChars()
    // Merge fresh decisions into the durable stamp set.
    for (const [id, set] of this.#decisions) {
      const prior = this.#stamped.get(id)
      this.#stamped.set(id, prior ? new Set([...prior, ...set]) : new Set(set))
    }
  }

  /** Reset per-decide scan state and walk backward to compute turn
   *  ages + index messages by id. Call-side indexing is handled by
   *  `#buildCallIndex` (called eagerly in `apply`). */
  #prepare(messages: readonly Message[]): void {
    this.#files.clear()
    this.#buckets.clear()
    this.#decisions.clear()
    this.#now = Date.now()
    this.#turns.clear()
    this.#messages.clear()

    let turn = 0
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i]
      if (!m.id) continue
      this.#messages.set(m.id, m)
      if (m.role === "user") turn++
      this.#turns.set(m.id, turn)
    }
  }

  #walkUser(m: Message<"user">): void {
    if (typeof m.content === "string") return
    for (let pi = 0; pi < m.content.length; pi++) {
      if (isAttachment(m.content[pi])) this.#checkAttachment(m, pi)
    }
  }

  #walkTool(m: Message<"tool">): void {
    for (let pi = 0; pi < m.content.length; pi++) {
      const p = m.content[pi]
      if (p.isError) continue
      if (hasAttachments(p.content)) this.#checkAttachment(m, pi)
      if (isFileTool(p.name)) {
        this.#checkFile(m, p as ToolResultPart<FileTool>, pi)
        continue
      }
      this.#checkTools(m, p, pi)
    }
  }

  /** Attachments — single global "bucket". `attachmentsSeen` tracks how
   *  many newer attachments we've passed; it is the part's `fromEnd`. */
  #checkAttachment(msg: Message, partIdx: number): void {
    if (!this.#opts.attachments || !msg.id) return
    if (this.#shouldMask("attachments", msg, this.#opts.attachments)) {
      markPart(this.#decisions, msg.id, partIdx)
    }
  }

  get files() {
    return this.#files
  }

  /** File ops — bucketed by path. The first occurrence on a path
   *  (walking backward) is "latest"; later in the walk we know what's
   *  been superseded. Per-kind `keep[kind]` caps how many stale ops
   *  to retain unmasked. */
  #checkFile(msg: Message, p: ToolResultPart<FileTool>, partIdx: number): void {
    if (!this.#opts.files || !msg.id) return
    const kind = p.name
    const info = classifyFileCall(p.name, this.#callIndex.get(p.id)?.params)
    if (!info) return
    const s: FileState = this.#files.get(info.path) ?? { edit: 0, read: 0, stale: false, write: 0 }
    if (s.stale) {
      if (s[kind] >= (this.#opts.files[kind] ?? Infinity))
        markPart(this.#decisions, msg.id, partIdx)
      else s[kind]++
    }
    s.stale ||= info.full
    this.#files.set(info.path, s)
  }

  /** Non-file tools — bucket by `${name}:${dedupeKey}` (or skip when
   *  `dedupe: false`). The first occurrence in a bucket is the current;
   *  subsequent encounters are duplicates and get the unified rule
   *  applied with `fireOnDup=true` (duplicate-ness itself is a
   *  trigger). */
  #checkTools(msg: Message<"tool">, p: ToolResultPart, partIdx: number): void {
    if (!this.#opts.tools || !msg.id) return
    let rules = this.#opts.tools.filter((r) => r.tool === p.name)
    rules = rules.length > 0 ? rules : this.#opts.tools.filter((r) => r.tool === "*")
    const call = this.#callIndex.get(p.id)
    if (!call) return
    let mask = false
    for (const rule of rules) {
      const key = toolBucketKey(call, rule)
      if (key !== undefined && this.#shouldMask(key, msg, rule)) mask = true
    }
    if (mask) markPart(this.#decisions, msg.id, partIdx)
  }

  /** The unified mask predicate. Walking newest → oldest, the first
   *  item in a bucket is always kept (`used === 0`); the bucket key
   *  defines uniqueness, so every subsequent item is by definition a
   *  duplicate (`used > 0`) and fires the default mask. `maxAge` /
   *  `maxTurns` are *additional* triggers — they only fire when their
   *  data is present, so a message without `ts` can't trip `maxAge`.
   *  The `keep` floor protects the next N items from being masked,
   *  even when they'd otherwise be considered duplicates. */
  #shouldMask(bucket: string, msg: Message, rule: MaskRule): boolean {
    const turn = msg.id ? this.#turns.get(msg.id) : undefined
    const ts = msg.ts
    const used = this.#buckets.get(bucket)?.count ?? 0
    const mask =
      used > 0 ||
      (rule.maxAge !== undefined && ts !== undefined && this.#now - ts > rule.maxAge) ||
      (rule.maxTurns !== undefined && turn !== undefined && turn > rule.maxTurns)
    const keep = !mask || used === 0 || used < (rule.keep ?? 0)
    this.#buckets.set(bucket, { count: used + (keep ? 1 : 0) })
    return !keep
  }

  /** Drop fresh decisions for tool-result parts whose original content
   *  is below `minChars` unless they carry an attachment. Already-
   *  stamped parts are unaffected — their bytes were committed last
   *  turn and must stay stable. */
  #filterMinChars() {
    for (const [i, partIdxSet] of this.#decisions) {
      const m = this.#messages.get(i)
      if (!m) continue
      if (m.role !== "tool") continue
      const id = m.id
      const prior = id !== undefined ? this.#stamped.get(id) : undefined
      for (const pi of partIdxSet) {
        if (prior?.has(pi)) continue
        const p = m.content[pi]
        if (hasAttachments(p.content)) continue
        if (JSON.stringify(p.content).length < this.#opts.minChars) partIdxSet.delete(pi)
      }
      if (partIdxSet.size === 0) this.#decisions.delete(i)
    }
  }

  /** Apply previously-stamped masks to produce the projected output.
   *  Reads only from `#stamped` — fresh decisions from `#decide` are
   *  already merged in. Cheap; no per-part decision logic. */
  #render(messages: readonly Message[]): Message[] {
    const out: Message[] = Array.from({ length: messages.length })
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i]
      if (m.role !== "tool" && m.role !== "user" && m.role !== "assistant") {
        out[i] = m
        continue
      }
      const id = m.id
      if (id === undefined) {
        out[i] = m
        continue
      }
      const stamped = this.#stamped.get(id)
      if (!stamped || stamped.size === 0) {
        out[i] = m
        continue
      }
      if (m.role === "tool") out[i] = maskToolParts(m, this.#callIndex, stamped)
      else if (m.role === "user") out[i] = maskUserParts(m, stamped)
      else out[i] = maskAssistantParts(m, stamped)
    }
    return out
  }
}

// ── Scan-state shapes ─────────────────────────────────────────────────

interface CallLocation {
  msgId: string
  partIdx: number
}
interface FileState {
  read: number
  write: number
  edit: number
  stale: boolean
}

interface BucketState {
  count: number
}

// ── Tool dedupe bucket key ─────────────────────────────────────────────

/** Compute a bucket key for a tool result, or `undefined` to skip the
 *  tool entirely. `dedupe: false` exempts the tool from masking; other
 *  values fold the params (or projected subset) into a stable key. */
function toolBucketKey(call: ToolCallPart, rule: ToolRule): string | undefined {
  const key = rule.key
  if (key === "name") return call.name
  const params = parseParams(call.params)
  if (!params) return undefined
  if (key === "params") return `${call.name}:${safeStringify(params)}`
  // function case
  const k = key(params)
  return k === undefined ? undefined : `${call.name}:${k}`
}

// ── File classification ────────────────────────────────────────────────

type FileTool = "read" | "write" | "edit"
const FILE_TOOLS = new Set<FileTool>(["read", "write", "edit"])

function isFileTool(name: string): name is FileTool {
  return FILE_TOOLS.has(name as FileTool)
}

const FULL_READ_LIMIT_THRESHOLD = 2000

function classifyFileCall(
  kind: FileTool,
  params: unknown
): { path: string; full: boolean } | undefined {
  if (!params) return undefined
  if (kind === "write") {
    const p = parseParams<ToolParams<WriteTool>>(params)
    return p?.path ? { full: true, path: p.path } : undefined
  } else if (kind === "edit") {
    const p = parseParams<ToolParams<EditTool>>(params)
    return p?.path ? { full: false, path: p.path } : undefined
  }
  const p = parseParams<ToolParams<ReadTool>>(params)
  if (!p?.path) return undefined
  const offset = typeof p.offset === "number" ? p.offset : 1
  const limit = typeof p.limit === "number" ? p.limit : FULL_READ_LIMIT_THRESHOLD
  return { full: offset <= 1 && limit >= FULL_READ_LIMIT_THRESHOLD, path: p.path }
}

// ── Tool-call propagation (write/edit) ─────────────────────────────────

const PROPAGATED_TOOLS: ReadonlySet<string> = new Set(["write", "edit"])

function propagateWriteEditCalls(
  messages: Map<string, Message>,
  decisions: Map<string, Set<number>>,
  callLocations: Map<string, CallLocation>
): void {
  for (const [msgId, set] of decisions) {
    for (const partIdx of set) {
      const m = messages.get(msgId)
      if (!m?.id || m.role !== "tool") continue
      const p = m.content[partIdx]
      if (!PROPAGATED_TOOLS.has(p.name)) continue
      const loc = callLocations.get(p.id)
      if (!loc) continue
      markPart(decisions, loc.msgId, loc.partIdx)
    }
  }
}

// ── Helpers ────────────────────────────────────────────────────────────

function parseParams<T>(params: unknown): Partial<T> | undefined {
  params = typeof params === "string" ? safeParseJson(params) : params
  return typeof params === "object" && params !== null ? (params as Partial<T>) : undefined
}

function markPart(out: Map<string, Set<number>>, msgId: string, partIdx: number): void {
  const set = out.get(msgId) ?? new Set<number>()
  set.add(partIdx)
  out.set(msgId, set)
}


// ── Render (mask helpers) ──────────────────────────────────────────────

function maskToolParts(
  m: Message<"tool">,
  calls: Map<string, ToolCallPart>,
  parts: Set<number>
): Message<"tool"> {
  return {
    ...m,
    content: m.content.map((p, i) => (parts.has(i) ? maskResult(p, calls.get(p.id)) : p)),
  }
}

function maskUserParts(m: Message<"user">, parts: Set<number>): Message<"user"> {
  if (typeof m.content === "string") return m
  return {
    ...m,
    content: m.content.map((p, i) => (parts.has(i) && isAttachment(p) ? attachmentStub(p) : p)),
  }
}

function maskAssistantParts(m: Message<"assistant">, parts: Set<number>): Message<"assistant"> {
  if (typeof m.content === "string") return m
  return {
    ...m,
    content: m.content.map((p, i) =>
      parts.has(i) && p.type === "tool-call" ? maskToolCall(p) : p
    ),
  }
}

function maskToolCall(p: ToolCallPart): ToolCallPart {
  return { ...p, params: { masked: stubText(p.name, p.params) } }
}

function maskResult(p: ToolResultPart, call: ToolCallPart | undefined): ToolResultPart {
  if (p.isError) return p
  return {
    content: [{ text: stubText(p.name, call?.params), type: "text" }],
    id: p.id,
    name: p.name,
    type: "tool-result",
  }
}

function attachmentStub(p: Attachment): TextPart {
  return { text: `[masked: ${p.type} attachment. Re-attach if needed.]`, type: "text" }
}

function stubText(name: string, params: unknown): string {
  // File tools: the assistant tool-call message above already carries
  // the full params (path + edits / content). Stub mentions just the
  // path so we don't double-encode multi-KB edit text in every stub.
  if (isFileTool(name)) {
    const path = callPath(params)
    return path
      ? `[masked: prior \`${name}(${path})\` result. Re-call to refresh.]`
      : `[masked: prior \`${name}\` result. Re-call to refresh.]`
  }
  const args = params === undefined ? "" : safeStringify(params)
  const call = args ? `${name}(${args})` : `${name}(…)`
  return `[masked: prior \`${call}\` result. Re-call to refresh.]`
}

function callPath(params: unknown): string | undefined {
  const obj = parseParams<{ path?: string }>(params)
  return obj && typeof obj.path === "string" ? obj.path : undefined
}
