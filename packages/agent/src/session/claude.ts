import type {
  Attachment,
  ImagePart,
  Message,
  ReasoningPart,
  TextPart,
  ToolCallPart,
  ToolResultPart,
} from "@zaly/ai"

import { readFile } from "node:fs/promises"
import { Session } from "./index.ts"

/**
 * Read a Claude Code session file (`.jsonl` from `~/.claude/projects/...`)
 * and rehydrate the active conversation chain into a fresh zaly `Session`.
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
 * doesn't expose those for arbitrary imports. The returned session has
 * no `path` attached; pass it into a fresh `new Session({ path })` if
 * you want to start persisting the imported chain in zaly format.
 */
export async function loadClaudeSession(path: string): Promise<Session> {
  const text = await readFile(path, "utf8").catch((error: unknown) => {
    throw new Error(
      `loadClaudeSession: cannot read "${path}": ${(error as Error).message}`,
      { cause: error }
    )
  })

  const records = parseRecords(text, path)
  const chain = walkChain(records)
  const toolNames = collectToolNames(chain)

  const session = new Session()
  session.start()
  const messages: Message[] = []
  for (const rec of chain) {
    const msg = toZalyMessage(rec, toolNames)
    if (msg) messages.push(msg)
  }
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
  for (const m of messages) session.add(m)
  return session
}

// ── Parsing ──────────────────────────────────────────────────────────────

interface ClaudeRecord {
  type: string
  uuid?: string
  parentUuid?: string
  isSidechain?: boolean
  message?: ClaudeMessage
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

/** Build a `tool_use_id → tool_name` map from the assistant tool_use
 *  blocks in the chain. Used to fill in the missing `name` on
 *  `tool_result` blocks (Claude only stores the id on results). */
function collectToolNames(chain: readonly ClaudeRecord[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const rec of chain) {
    if (rec.type !== "assistant") continue
    const content = rec.message?.content
    if (!Array.isArray(content)) continue
    for (const block of content) {
      if (block.type === "tool_use" && typeof block.id === "string" && typeof block.name === "string") {
        out.set(block.id, block.name)
      }
    }
  }
  return out
}

// ── Conversion ───────────────────────────────────────────────────────────

function toZalyMessage(rec: ClaudeRecord, toolNames: Map<string, string>): Message | undefined {
  const inner = rec.message
  if (!inner) return undefined

  if (rec.type === "user") return toUserMessage(inner, toolNames)
  if (rec.type === "assistant") return toAssistantMessage(inner)
  return undefined
}

function toUserMessage(inner: ClaudeMessage, toolNames: Map<string, string>): Message | undefined {
  const content = inner.content
  if (typeof content === "string") {
    return { content, role: "user" }
  }
  if (!Array.isArray(content) || content.length === 0) return undefined

  // If every block is a tool_result, this is a zaly tool message.
  if (content.every((b) => b.type === "tool_result")) {
    const parts = content
      .map((b) => toToolResultPart(b as Extract<ClaudeBlock, { type: "tool_result" }>, toolNames))
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
  toolNames: Map<string, string>
): ToolResultPart | undefined {
  if (typeof block.tool_use_id !== "string") return undefined
  return {
    content: toToolResultContent(block.content),
    id: block.tool_use_id,
    isError: block.is_error === true,
    name: toolNames.get(block.tool_use_id) ?? "",
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

function toAssistantMessage(inner: ClaudeMessage): Message | undefined {
  const content = inner.content
  if (typeof content === "string") {
    return { content, role: "assistant" }
  }
  if (!Array.isArray(content)) return undefined

  const parts: (TextPart | ReasoningPart | ToolCallPart)[] = []
  for (const block of content) {
    const part = toAssistantPart(block)
    if (part) parts.push(part)
  }
  if (parts.length === 0) return undefined
  return { content: parts, role: "assistant" }
}

function toAssistantPart(
  block: ClaudeBlock
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
    return { id: block.id, name: block.name, params: block.input, type: "tool-call" }
  }
  return undefined
}
