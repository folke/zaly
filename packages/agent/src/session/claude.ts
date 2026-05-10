import type {
  Attachment,
  ImagePart,
  Message,
  ReasoningPart,
  TextPart,
  ToolCallPart,
  ToolResultPart,
  Usage,
} from "@zaly/ai"

import { normPath } from "@zaly/shared"
import { JsonlReader } from "./jsonl.ts"

/**
 * Read a Claude Code session file (`.jsonl` from `~/.claude/projects/...`)
 * and return its active conversation chain as zaly `Message[]` — pass
 * the result to `Agent.load({ messages, ... })` to seed a fresh agent
 * with the imported history.
 *
 * Claude Code stores its conversation as one JSON record per line. The
 * active chain is reconstructed by walking `parentUuid` backward from the
 * most recent on-chain user/assistant message. Non-message records
 * (`permission-mode`, `attachment`, `system`, `summary`, `file-history-
 * snapshot`, ...), sidechain branches (`isSidechain: true`), and orphan
 * lines outside the chain are skipped.
 *
 * Format mapping:
 *
 * - **User message, string content** → zaly `role: "user"`, content
 *   passed through verbatim.
 * - **User message, array content with `tool_result` blocks** → zaly
 *   `role: "tool"`. Anthropic's wire format puts tool results in a
 *   user message; zaly splits them into a dedicated `tool` role. The
 *   tool name (which Claude doesn't store on the result) is resolved
 *   from the matching `tool_use` block earlier in the chain.
 * - **User message, array content with text/image blocks** → zaly
 *   `role: "user"` with the parts converted (text passes through,
 *   images become `ImagePart`).
 * - **Assistant message** → zaly `role: "assistant"` with each block
 *   mapped: `text` → `TextPart`, `tool_use` → `ToolCallPart` (the
 *   block's `input` becomes `params`). `thinking` / `redacted_thinking`
 *   blocks are intentionally dropped on import — Anthropic requires
 *   them to round-trip with the exact original `signature` or the next
 *   request 400s, and any intermediate processing risks corrupting it.
 *   The visible conversation state survives without them.
 *
 * Lossy by design — tokens, finish reasons, model swaps, and timing
 * info from Claude's records are dropped because zaly's `Session.add`
 * doesn't expose those for arbitrary imports. The returned messages
 * carry no `path` association; pass `session: { path: "..." }` to
 * `Agent.load` alongside them if you want to start persisting the
 * imported chain in zaly format.
 */
export interface ClaudeSessionOptions {
  /** Hook to convert a Claude tool call into a zaly equivalent. Returns
   *  the converted `{ name, params }` (e.g. `Read` → `read`, `file_path`
   *  → `path`) or `undefined` to leave it unchanged. The id is preserved
   *  so the matching `tool_result` correlates correctly.
   *
   *  Defaults to `defaultConvertTool`, which maps Claude Code's
   *  `Read`/`Write`/`Edit`/`MultiEdit`/`Bash` to zaly equivalents and
   *  lowercases anything else. Pass a custom function to extend or
   *  override; call `defaultConvertTool` from inside it to fall through
   *  for unhandled cases. */
  convertTool?: ConvertTool
  /** Which messages to import:
   *    - `"active"` (default) — walks `parentUuid` back from the most
   *      recent on-chain message. Returns the conversation as the model
   *      currently sees it: branches not on the active head are skipped,
   *      pre-compact history (parented to a summary record) is dropped.
   *    - `"all"` — every user/assistant message in the file, in
   *      chronological order, regardless of branch or compaction. Useful
   *      for analytics, fixtures, or recovering pre-compact context. */
  walk?: "active" | "all"
}

export type ConvertTool = (call: ClaudeToolCall) => ZalyToolCall | undefined
export interface ClaudeToolCall {
  name: string
  input: unknown
}
export interface ZalyToolCall {
  name: string
  params: unknown
}

export async function loadClaudeSession(
  path: string,
  opts: ClaudeSessionOptions = {}
): Promise<{ messages: Message[] }> {
  // Honor `~` and relative shorthands — config-file / env paths often
  // include them and Node's fs APIs don't expand `~` natively.
  path = normPath(path)
  const convert = opts.convertTool ?? defaultConvertTool
  const chain = opts.walk === "all" ? await collectAll(path) : await walkChainLazy(path)
  const toolCalls = collectToolCalls(chain, convert)

  const messages: Message[] = []
  for (const rec of chain) {
    const msg = toZalyMessage(rec, toolCalls)
    if (!msg) continue
    if (msg.role === "assistant") {
      const usage = recordUsage(rec)
      if (usage) msg.meta = { ...msg.meta, usage }
    }
    messages.push(msg)
  }
  messages.sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0))
  // De-duplicate tool_use ids. Claude Code branching / sidechain replay
  // can emit the same tool_use_id across multiple assistant messages
  // (especially with `walk: "all"`); downstream consumers like the
  // masker or any (id → call) lookup expect uniqueness.
  dedupCallIds(messages)
  return { messages }
}

/** Build a `Usage` from a Claude record's `message.usage` block.
 *  Returns undefined when no usage info is present (user messages,
 *  tool results). The caller stamps it onto `message.meta.usage`. */
function recordUsage(rec: ClaudeRecord): Usage | undefined {
  const u = rec.message?.usage
  if (!u) return undefined
  const usage: Usage = {
    input: u.input_tokens ?? 0,
    output: u.output_tokens ?? 0,
  }
  if (u.cache_read_input_tokens !== undefined) usage.cacheRead = u.cache_read_input_tokens
  if (u.cache_creation_input_tokens !== undefined) usage.cacheWrite = u.cache_creation_input_tokens
  return usage
}

// ── Parsing ──────────────────────────────────────────────────────────────

interface ClaudeRecord {
  type: string
  uuid?: string
  parentUuid?: string
  isSidechain?: boolean
  /** Set on the synthetic user-role record Claude Code writes for a
   *  `/compact`. The record's content is the summary text; chronologically
   *  it sits where the compaction happened, with its `parentUuid` still
   *  pointing into pre-compaction history. The active conversation is
   *  this summary plus everything after — pre-compaction messages are
   *  unreachable from the live agent. */
  isCompactSummary?: boolean
  message?: ClaudeMessage
  /** Wall-clock time the original Claude session recorded the message,
   *  ISO 8601 string. Preserved onto `Message.ts` so age-based logic
   *  (masker `maxAge`, freshness, replay) sees realistic timestamps
   *  rather than the import time. */
  timestamp?: string
  /** Claude Code attaches structured per-tool result info here, alongside
   *  the model-visible `tool_result` block. Shape varies by tool:
   *    - read   → `{ type: "text"|"image", file: { filePath, ... } }`
   *    - write  → `{ type: "create", filePath, content, originalFile, ... }`
   *    - edit   → `{ type: "update", filePath, content, originalFile, ... }`
   *    - bash   → `{ stdout, stderr, interrupted, ... }`
   *  We mine this for `meta` to populate on imported `ToolResultPart`s.
   */
  toolUseResult?: ClaudeToolUseResult
}

type ClaudeToolUseResult =
  | string
  | {
      type?: "text" | "image" | "create" | "update" | "file_unchanged"
      file?: {
        filePath?: string
        content?: string
        numLines?: number
        startLine?: number
        totalLines?: number
      }
      filePath?: string
      /** Set on MultiEdit / Write results — post-state file content. */
      content?: string
      /** Set on Edit results (single replacement). The post-state must
       *  be derived by applying `oldString` → `newString` to
       *  `originalFile`. */
      oldString?: string
      newString?: string
      replaceAll?: boolean
      originalFile?: string
      structuredPatch?: ClaudeStructuredHunk[]
      [key: string]: unknown
    }

interface ClaudeStructuredHunk {
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  lines: string[]
}

interface ClaudeMessage {
  role?: "user" | "assistant"
  content?: string | ClaudeBlock[]
  model?: string
  usage?: ClaudeUsage
  stop_reason?: string
}

interface ClaudeUsage {
  input_tokens?: number
  output_tokens?: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
}

type ClaudeBlock =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking: string; signature?: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | {
      type: "tool_result"
      tool_use_id: string
      content?: string | ClaudeBlock[]
      is_error?: boolean
    }
  | {
      type: "image"
      source: { type: "base64"; media_type: string; data: string } | { type: "url"; url: string }
    }
  | { type: string; [key: string]: unknown } // unknown block — falls through to a placeholder

// ── Chain walk ───────────────────────────────────────────────────────────

/** Walk the parentUuid chain backward from the most recent on-chain
 *  user/assistant message and return the chronologically-ordered
 *  conversation. Reads the file lazily (backward in chunks) — only the
 *  chunks containing the active chain get pulled from disk.
 *
 *  Subtlety: Claude Code interleaves non-message records (`attachment`,
 *  `system`, `file-history-snapshot`, ...) into the parent chain — an
 *  assistant message's `parentUuid` may point at an `attachment`, whose
 *  `parentUuid` then points at the prior user message. We step *through*
 *  those records (using a uuid → ANY record map), collecting only the
 *  user/assistant messages we encounter. Sidechain messages are skipped.
 *
 *  For long-running sessions with multiple compactions, the active chain
 *  typically lives in the file's most recent chunks — so a 300MB session
 *  loads from a few hundred KB rather than reading the whole file. */
async function walkChainLazy(path: string): Promise<ClaudeRecord[]> {
  const reader = new JsonlReader<ClaudeRecord>(path)
  const byUuid = new Map<string, ClaudeRecord>()
  try {
    // Phase 1: read backward until we find the most recent on-chain
    // (non-sidechain) user/assistant message.
    let lastOnChain: string | undefined
    let value: ClaudeRecord | undefined
    // eslint-disable-next-line no-await-in-loop
    while ((value = await reader.next()) !== undefined) {
      if (value.uuid !== undefined) byUuid.set(value.uuid, value)
      if (isMessageRecord(value) && value.isSidechain !== true) {
        lastOnChain = value.uuid
        break
      }
    }
    if (lastOnChain === undefined) return []

    // Phase 2: walk parentUuid backward, fetching more records lazily
    // as needed to resolve each cursor. A `summary` record is a HARD
    // boundary — Claude Code compactions create a summary node and
    // anything before it is unreachable in the live conversation, so
    // we must not walk past it (would otherwise pull pre-compaction
    // history that the model can no longer see).
    const chain: ClaudeRecord[] = []
    let cursor: string | undefined = lastOnChain
    while (cursor !== undefined) {
      let rec = byUuid.get(cursor)
      if (!rec) {
        // Pull more records from the reader until we find this uuid
        // (or run out). Records pulled along the way get cached for
        // later cursor lookups.
        // eslint-disable-next-line no-await-in-loop
        while ((value = await reader.next()) !== undefined) {
          if (value.uuid !== undefined) byUuid.set(value.uuid, value)
          if (value.uuid === cursor) {
            rec = value
            break
          }
        }
      }
      if (!rec) break
      // Compaction boundary — Claude writes the synthetic summary as a
      // user-role record flagged `isCompactSummary`. Include it (it IS
      // the visible context for the resumed conversation) and stop —
      // anything older than this is unreachable from the live agent.
      if (rec.isCompactSummary === true) {
        chain.push(rec)
        break
      }
      if (isMessageRecord(rec) && rec.isSidechain !== true) chain.push(rec)
      cursor = rec.parentUuid
    }
    return chain.toReversed()
  } finally {
    await reader.close()
  }
}

function isMessageRecord(rec: ClaudeRecord): boolean {
  return rec.type === "user" || rec.type === "assistant"
}

/** Every user/assistant message in file order, ignoring branches and
 *  compaction boundaries. Sidechain messages are still skipped — those
 *  belong to subagent loops and would scramble the main chain.
 *
 *  This mode reads the entire file (necessary to find every record),
 *  but uses chunked I/O via `JsonlReader` instead of slurping the
 *  whole string at once. */
async function collectAll(path: string): Promise<ClaudeRecord[]> {
  const reader = new JsonlReader<ClaudeRecord>(path)
  const records: ClaudeRecord[] = []
  try {
    let value: ClaudeRecord | undefined
    // eslint-disable-next-line no-await-in-loop
    while ((value = await reader.next()) !== undefined) {
      if (isMessageRecord(value) && value.isSidechain !== true) records.push(value)
    }
  } finally {
    await reader.close()
  }
  // Reader yields newest-first; flip to chronological.
  return records.toReversed()
}

/** Build a `tool_use_id → { name, params }` map from the assistant
 *  tool_use blocks in the chain, applying `convert` to remap names and
 *  params into zaly's tool shapes. Used both to render the converted
 *  `tool-call` parts on the assistant side and to fill in the (missing)
 *  `name` on Claude `tool_result` blocks at result-conversion time. */
function collectToolCalls(
  chain: readonly ClaudeRecord[],
  convert: ConvertTool
): Map<string, ZalyToolCall> {
  const out = new Map<string, ZalyToolCall>()
  for (const rec of chain) {
    if (rec.type !== "assistant") continue
    const content = rec.message?.content
    if (!Array.isArray(content)) continue
    for (const block of content) {
      if (
        block.type === "tool_use" &&
        typeof block.id === "string" &&
        typeof block.name === "string"
      ) {
        const claude = { input: block.input, name: block.name }
        const zaly = convert(claude) ?? { name: block.name, params: block.input }
        out.set(block.id, zaly)
      }
    }
  }
  return out
}

/** Default `convertTool` mapping. Handles the standard Claude Code
 *  toolbox; everything else falls through to a lowercased name with
 *  params untouched. Composable: custom converters can call this for
 *  unhandled cases. */
function defaultConvertTool(call: ClaudeToolCall): ZalyToolCall {
  const input = (call.input ?? {}) as Record<string, unknown>
  switch (call.name) {
    case "Read": {
      return { name: "read", params: renameKey(input, "file_path", "path") }
    }
    case "Write": {
      return { name: "write", params: renameKey(input, "file_path", "path") }
    }
    case "Edit": {
      const { file_path, old_string, new_string, replace_all, ...rest } = input
      return {
        name: "edit",
        params: {
          edits: [{ newText: new_string, oldText: old_string, replaceAll: replace_all }],
          path: file_path,
          ...rest,
        },
      }
    }
    case "MultiEdit": {
      const { file_path, edits, ...rest } = input
      const mapped = Array.isArray(edits)
        ? edits.map((e: Record<string, unknown>) => ({
            newText: e.new_string,
            oldText: e.old_string,
            replaceAll: e.replace_all,
          }))
        : []
      return { name: "edit", params: { edits: mapped, path: file_path, ...rest } }
    }
    case "Bash": {
      return { name: "bash", params: input }
    }
    default: {
      return { name: call.name.toLowerCase(), params: input }
    }
  }
}

function renameKey(
  obj: Record<string, unknown>,
  from: string,
  to: string
): Record<string, unknown> {
  if (!(from in obj)) return obj
  const { [from]: value, ...rest } = obj
  return { [to]: value, ...rest }
}

/** Walk messages in chronological order; when a tool-call id reappears,
 *  rename the duplicate (and the corresponding tool-result) to a fresh
 *  id. Pairs are matched FIFO per-id: each duplicate call's pending
 *  rename gets consumed by the next tool-result with that original id.
 *  Mutates the message parts in place. */
function dedupCallIds(messages: readonly Message[]): void {
  const seen = new Set<string>()
  // Per-id queue of renames awaiting their tool-result.
  const pending = new Map<string, string[]>()
  let counter = 0
  for (const m of messages) {
    if (m.role === "assistant" && Array.isArray(m.content)) {
      for (const p of m.content) {
        if (p.type !== "tool-call") continue
        if (!seen.has(p.id)) {
          seen.add(p.id)
          continue
        }
        const newId = `${p.id}-${++counter}`
        const list = pending.get(p.id) ?? []
        list.push(newId)
        pending.set(p.id, list)
        p.id = newId
      }
    } else if (m.role === "tool") {
      for (const p of m.content) {
        const origId = p.id
        const list = pending.get(origId)
        if (!list || list.length === 0) continue
        p.id = list.shift()!
        if (list.length === 0) pending.delete(origId)
      }
    }
  }
}

// ── Conversion ───────────────────────────────────────────────────────────

function toZalyMessage(
  rec: ClaudeRecord,
  toolCalls: Map<string, ZalyToolCall>
): Message | undefined {
  const inner = rec.message
  if (!inner) return undefined

  let m: Message | undefined
  if (rec.type === "user") m = toUserMessage(inner, toolCalls, rec.toolUseResult)
  else if (rec.type === "assistant") m = toAssistantMessage(inner, toolCalls)
  if (!m) return undefined

  // Preserve the original Claude timestamp so age-based logic (masker
  // `maxAge`, freshness checks, replay) sees realistic times instead
  // of when the import ran.
  if (rec.timestamp) {
    const ts = Date.parse(rec.timestamp)
    if (!Number.isNaN(ts)) m = { ...m, ts }
  }
  // Carry the record's uuid as the message id so the imported message
  // can be referenced by the session DAG (and so per-message meta lifted
  // off the same record can be looked up back here).
  if (rec.uuid) m = { ...m, id: rec.uuid }
  return m
}

function toUserMessage(
  inner: ClaudeMessage,
  toolCalls: Map<string, ZalyToolCall>,
  toolUseResult: ClaudeToolUseResult | undefined
): Message | undefined {
  const content = inner.content
  if (typeof content === "string") {
    return { content, role: "user" }
  }
  if (!Array.isArray(content) || content.length === 0) return undefined

  // If every block is a tool_result, this is a zaly tool message.
  if (content.every((b) => b.type === "tool_result")) {
    const parts = content
      .map((b) =>
        toToolResultPart(
          b as Extract<ClaudeBlock, { type: "tool_result" }>,
          toolCalls,
          toolUseResult
        )
      )
      .filter((p): p is ToolResultPart => p !== undefined)
    if (parts.length === 0) return undefined
    return { content: parts, role: "tool" }
  }

  // Otherwise treat as a user message with text / image parts. Mixed
  // arrays carrying a tool_result alongside text are rare; we drop the
  // tool_result here (it would belong on its own message) and keep the
  // visible content.
  const parts = content
    .map((b) => toUserPart(b))
    .filter((p): p is TextPart | Attachment => p !== undefined)
  if (parts.length === 0) return undefined
  return { content: parts, role: "user" }
}

function toToolResultPart(
  block: Extract<ClaudeBlock, { type: "tool_result" }>,
  toolCalls: Map<string, ZalyToolCall>,
  toolUseResult: ClaudeToolUseResult | undefined
): ToolResultPart | undefined {
  if (typeof block.tool_use_id !== "string") return undefined
  const name = toolCalls.get(block.tool_use_id)?.name ?? ""
  const meta = toolUseResultMeta(name, toolUseResult)
  return {
    content: toToolResultContent(block.content),
    id: block.tool_use_id,
    isError: block.is_error === true,
    name,
    type: "tool-result",
    ...(meta !== undefined ? { meta } : {}),
  }
}

/** Map Claude Code's per-tool `toolUseResult` shape onto our flat
 *  `meta` schema. mtime is unknown at import time — we set 0 so any
 *  later `assertFresh` check forces the agent to re-read before
 *  mutating, rather than trusting potentially-stale bytes. */
function toolUseResultMeta(
  name: string,
  result: ClaudeToolUseResult | undefined
): Record<string, unknown> | undefined {
  if (result === undefined || typeof result === "string") return undefined
  switch (name) {
    case "read": {
      const file = result.file
      if (!file?.filePath) return undefined
      return {
        full: file.totalLines !== undefined && file.numLines === file.totalLines,
        kind: "read",
        limit: file.numLines,
        mtime: 0,
        offset: file.startLine,
        path: file.filePath,
      }
    }
    case "write": {
      if (!result.filePath) return undefined
      // Post-write content lives on the original tool call's
      // `params.content`; we only stash `original` (pre-write).
      return {
        full: true,
        kind: "write",
        mtime: 0,
        original: result.originalFile,
        path: result.filePath,
      }
    }
    case "edit": {
      if (!result.filePath) return undefined
      // Several Claude Code shapes to handle:
      //  1. MultiEdit / older Edit: `content` (post-state) is provided
      //     directly alongside `originalFile` (pre-state).
      //  2. Single Edit with full pre-state: `oldString`/`newString`
      //     swap on top of a populated `originalFile`. Derive content
      //     by applying the swap.
      //  3. Single Edit without pre-state but with `structuredPatch`:
      //     reconstruct synthetic pre/post strings from the patch hunks
      //     (Claude Code's UI does the same trick — the patch carries
      //     context + line numbers). The diff widget then renders with
      //     the real file line numbers in the gutter.
      //  4. None of the above: fall back to showing just the swap.
      const originalFile =
        typeof result.originalFile === "string" && result.originalFile.length > 0
          ? result.originalFile
          : undefined
      let original = originalFile ?? ""
      let content = ""

      if (typeof result.content === "string") {
        content = result.content
      } else if (typeof result.oldString === "string" && typeof result.newString === "string") {
        const { newString, oldString } = result
        const applied = applyClaudeEdit(originalFile, oldString, newString, result.replaceAll)
        if (applied !== undefined) {
          content = applied
        } else {
          const synth = synthesizeFromStructuredPatch(result.structuredPatch)
          if (synth !== undefined) {
            original = synth.original
            content = synth.modified
          } else {
            original = oldString
            content = newString
          }
        }
      }
      return { content, kind: "edit", mtime: 0, original, path: result.filePath }
    }
    default: {
      return undefined
    }
  }
}

/** Apply a Claude single-Edit swap to the pre-edit content. Returns
 *  `undefined` when the edit can't be applied (no original file recorded
 *  or the search string doesn't appear in it) — caller falls back to
 *  showing just the swap. */
function applyClaudeEdit(
  original: string | undefined,
  oldString: string,
  newString: string,
  replaceAll: boolean | undefined
): string | undefined {
  if (original === undefined || !original.includes(oldString)) return undefined
  return replaceAll === true
    ? original.split(oldString).join(newString)
    : original.replace(oldString, newString)
}

/** Reconstruct synthetic pre/post strings from a Claude `structuredPatch`.
 *  Hunks are placed at their real line numbers (`oldStart`/`newStart`)
 *  with empty-line padding outside, so the diff widget's gutter shows
 *  accurate file line numbers — same effect as Claude Code's UI. Lines
 *  prefixed " "/" -" go to the original, " "/" +" go to modified. */
function synthesizeFromStructuredPatch(
  patch: ClaudeStructuredHunk[] | undefined
): { original: string; modified: string } | undefined {
  if (!Array.isArray(patch) || patch.length === 0) return undefined
  const origLines: string[] = []
  const modLines: string[] = []
  for (const h of patch) {
    padTo(origLines, h.oldStart)
    padTo(modLines, h.newStart)
    for (const raw of h.lines) {
      // Each entry is a unified-diff row: " ctx", "-removed", "+added".
      const tag = raw[0]
      const body = raw.slice(1)
      if (tag === "-") origLines.push(body)
      else if (tag === "+") modLines.push(body)
      else {
        origLines.push(body)
        modLines.push(body)
      }
    }
  }
  return { modified: modLines.join("\n"), original: origLines.join("\n") }
}

/** 1-based line indexing in the patch; pad with empty strings up to
 *  the target line so subsequent pushes land at the right index. */
function padTo(arr: string[], idx: number): void {
  while (arr.length < idx - 1) arr.push("")
}

/** Tool result content: Claude allows string OR an array of text/image
 *  blocks. Map both into zaly's `Content` shape. */
function toToolResultContent(
  content: string | ClaudeBlock[] | undefined
): ToolResultPart["content"] {
  if (content === undefined) return ""
  if (typeof content === "string") return content
  const parts = content
    .map((b) => toUserPart(b))
    .filter((p): p is TextPart | Attachment => p !== undefined)
  return parts.length > 0 ? parts : ""
}

function toUserPart(block: ClaudeBlock): TextPart | Attachment | undefined {
  if (block.type === "text" && typeof block.text === "string") {
    return { text: block.text, type: "text" }
  }
  if (block.type === "image") {
    return toImagePart(block as Extract<ClaudeBlock, { type: "image" }>)
  }
  return undefined
}

function toImagePart(block: Extract<ClaudeBlock, { type: "image" }>): ImagePart | undefined {
  const src = block.source
  if (src.type === "base64") {
    const mime = src.media_type
    if (mime !== "image/png" && mime !== "image/jpeg" && mime !== "image/webp") return undefined
    return { mime, source: { data: src.data, type: "base64" }, type: "image" }
  }
  // url-source images: zaly's ImagePart only types png/jpeg/webp mimes,
  // and we don't know the mime from a bare URL here. Skip — the model
  // already saw it in the original Claude session; losing it on import
  // is less bad than fabricating a wrong mime.
  return undefined
}

function toAssistantMessage(
  inner: ClaudeMessage,
  toolCalls: Map<string, ZalyToolCall>
): Message | undefined {
  const content = inner.content
  if (typeof content === "string") {
    return { content, role: "assistant" }
  }
  if (!Array.isArray(content)) return undefined

  const parts: (TextPart | ReasoningPart | ToolCallPart)[] = []
  for (const block of content) {
    const part = toAssistantPart(block, toolCalls)
    if (part) parts.push(part)
  }
  if (parts.length === 0) return undefined
  return { content: parts, role: "assistant" }
}

function toAssistantPart(
  block: ClaudeBlock,
  toolCalls: Map<string, ZalyToolCall>
): TextPart | ReasoningPart | ToolCallPart | undefined {
  if (block.type === "text" && typeof block.text === "string") {
    return { text: block.text, type: "text" }
  }
  // Reasoning / thinking blocks are intentionally dropped on import.
  // Anthropic requires them to round-trip with the exact original
  // `signature`, and any intermediate processing (truncation, reorder,
  // even just a different request shape) trips a 400 in the next turn.
  // The visible text and tool calls carry the conversation's effective
  // state; thinking is recoverable from re-running, so dropping it is
  // strictly safer than risking signature mismatch errors.
  if (block.type === "tool_use" && typeof block.id === "string" && typeof block.name === "string") {
    const call = toolCalls.get(block.id) ?? { name: block.name, params: block.input }
    return { id: block.id, name: call.name, params: call.params, type: "tool-call" }
  }
  return undefined
}
