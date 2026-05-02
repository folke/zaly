import type {
  Attachment,
  ImagePart,
  Message,
  ReasoningPart,
  TextPart,
  ToolCallPart,
  ToolResultPart,
} from "@zaly/ai"

import { normPath } from "@zaly/shared"
import { readFile } from "node:fs/promises"

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
  const text = await readFile(path, "utf8").catch((error: unknown) => {
    throw new Error(
      `loadClaudeSession: cannot read "${path}": ${(error as Error).message}`,
      { cause: error }
    )
  })

  const convert = opts.convertTool ?? defaultConvertTool
  const records = parseRecords(text, path)
  const chain = opts.walk === "all" ? collectAll(records) : walkChain(records)
  const toolCalls = collectToolCalls(chain, convert)

  const messages: Message[] = []
  for (const rec of chain) {
    const msg = toZalyMessage(rec, toolCalls)
    if (msg) messages.push(msg)
  }
  // De-duplicate tool_use ids. Claude Code branching / sidechain replay
  // can emit the same tool_use_id across multiple assistant messages
  // (especially with `walk: "all"`); downstream consumers like the
  // masker or any (id → call) lookup expect uniqueness.
  dedupCallIds(messages)
  // Mark the last message as a cache prefix endpoint. Anthropic's
  // adapter emits `cache_control: { type: "ephemeral" }` on the last
  // content block of the tagged message; all preceding history rides as
  // a cached prefix on subsequent calls within the 5-minute window. The
  // first request still pays full price, but every follow-up that lands
  // in the cache window only bills for the new tokens — critical for
  // long imported sessions where the full history would otherwise blow
  // through TPM limits on each turn.
  if (messages.length > 0) {
    const last = messages.at(-1)!
    messages[messages.length - 1] = { ...last, cache: { type: "ephemeral" } }
  }
  return { messages }
}

// ── Parsing ──────────────────────────────────────────────────────────────

interface ClaudeRecord {
  type: string
  uuid?: string
  parentUuid?: string
  isSidechain?: boolean
  message?: ClaudeMessage
  /** Wall-clock time the original Claude session recorded the message,
   *  ISO 8601 string. Preserved onto `Message.ts` so age-based logic
   *  (masker `maxAge`, freshness, replay) sees realistic timestamps
   *  rather than the import time. */
  timestamp?: string
}

interface ClaudeMessage {
  role?: "user" | "assistant"
  content?: string | ClaudeBlock[]
  model?: string
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

function parseRecords(text: string, path: string): ClaudeRecord[] {
  const lines = text.split("\n")
  const out: ClaudeRecord[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.length === 0) continue
    try {
      out.push(JSON.parse(line) as ClaudeRecord)
    } catch (error) {
      // Tolerate a truncated last line (Claude may write while we read).
      // Anything else is real corruption.
      if (i === lines.length - 1) continue
      throw new Error(
        `loadClaudeSession: malformed JSON at line ${i + 1} of "${path}": ${(error as Error).message}`,
        { cause: error }
      )
    }
  }
  return out
}

// ── Chain walk ───────────────────────────────────────────────────────────

/** Walk the parentUuid chain backward from the most recent on-chain
 *  user/assistant message and return the chronologically-ordered
 *  conversation.
 *
 *  Subtlety: Claude Code interleaves non-message records (`attachment`,
 *  `system`, `file-history-snapshot`, ...) into the parent chain — an
 *  assistant message's `parentUuid` may point at an `attachment`, whose
 *  `parentUuid` then points at the prior user message. We step *through*
 *  those records (using a uuid → ANY record map), collecting only the
 *  user/assistant messages we encounter. Sidechain messages are skipped
 *  during collection. */
function walkChain(records: readonly ClaudeRecord[]): ClaudeRecord[] {
  const byUuid = new Map<string, ClaudeRecord>()
  let lastOnChain: string | undefined
  for (const rec of records) {
    if (rec.uuid === undefined) continue
    byUuid.set(rec.uuid, rec)
    if (isMessageRecord(rec) && rec.isSidechain !== true) lastOnChain = rec.uuid
  }
  if (lastOnChain === undefined) return []

  const chain: ClaudeRecord[] = []
  let cursor: string | undefined = lastOnChain
  while (cursor !== undefined) {
    const rec = byUuid.get(cursor)
    if (!rec) break
    if (isMessageRecord(rec) && rec.isSidechain !== true) chain.push(rec)
    cursor = rec.parentUuid
  }
  return chain.toReversed()
}

function isMessageRecord(rec: ClaudeRecord): boolean {
  return rec.type === "user" || rec.type === "assistant"
}

/** Every user/assistant message in file order, ignoring branches and
 *  compaction boundaries. Sidechain messages are still skipped — those
 *  belong to subagent loops and would scramble the main chain. */
function collectAll(records: readonly ClaudeRecord[]): ClaudeRecord[] {
  return records.filter((rec) => isMessageRecord(rec) && rec.isSidechain !== true)
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
export function defaultConvertTool(call: ClaudeToolCall): ZalyToolCall {
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
  if (rec.type === "user") m = toUserMessage(inner, toolCalls)
  else if (rec.type === "assistant") m = toAssistantMessage(inner, toolCalls)
  if (!m) return undefined

  // Preserve the original Claude timestamp so age-based logic (masker
  // `maxAge`, freshness checks, replay) sees realistic times instead
  // of when the import ran.
  if (rec.timestamp) {
    const ts = Date.parse(rec.timestamp)
    if (!Number.isNaN(ts)) m = { ...m, ts }
  }
  return m
}

function toUserMessage(
  inner: ClaudeMessage,
  toolCalls: Map<string, ZalyToolCall>
): Message | undefined {
  const content = inner.content
  if (typeof content === "string") {
    return { content, role: "user" }
  }
  if (!Array.isArray(content) || content.length === 0) return undefined

  // If every block is a tool_result, this is a zaly tool message.
  if (content.every((b) => b.type === "tool_result")) {
    const parts = content
      .map((b) => toToolResultPart(b as Extract<ClaudeBlock, { type: "tool_result" }>, toolCalls))
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
  toolCalls: Map<string, ZalyToolCall>
): ToolResultPart | undefined {
  if (typeof block.tool_use_id !== "string") return undefined
  return {
    content: toToolResultContent(block.content),
    id: block.tool_use_id,
    isError: block.is_error === true,
    name: toolCalls.get(block.tool_use_id)?.name ?? "",
    type: "tool-result",
  }
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
  if (
    block.type === "tool_use" &&
    typeof block.id === "string" &&
    typeof block.name === "string"
  ) {
    const call = toolCalls.get(block.id) ?? { name: block.name, params: block.input }
    return { id: block.id, name: call.name, params: call.params, type: "tool-call" }
  }
  return undefined
}
