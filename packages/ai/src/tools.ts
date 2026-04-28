import type { Static, TObject, TSchema } from "typebox"
import type {
  Attachment,
  MetaPart,
  Streamable,
  TextPart,
  Tool,
  ToolContext,
  ToolResult,
} from "./types.ts"

import { safeStringify } from "@zaly/shared"
import Schema from "typebox/schema"
import { coerce } from "./json/coerce.ts"
import { parseJson } from "./json/parse.ts"
import { stringifyErrors } from "./json/stringify.ts"

export type { Streamable, ToolResult } from "./types.ts"

/** Runtime guard for `Streamable`. Harnesses use this to branch tool
 *  returns into the sync vs. potentially-long-running path. */
export function isStreamable(value: unknown): value is Streamable {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Streamable).poll === "function" &&
    typeof (value as Streamable).abort === "function" &&
    (value as Streamable).done instanceof Promise
  )
}

/**
 * Structured error a tool's `execute` can throw to signal a business
 * failure — "not found", "rate limited", "permission denied". The
 * runner catches it and emits a shape the LLM can recognise and recover
 * from: stable `code` for branching, free-form `message` for the model,
 * optional `data` for tool-specific context, `retryable` to hint that a
 * retry might succeed (transient upstream, stale auth, etc.).
 *
 * Anything else `execute` throws is treated as an internal error: the
 * runner still returns a `tool-result` so the turn can continue, but
 * the code is `INTERNAL` and the message is generic — genuine bugs
 * shouldn't be teaching the model new escape hatches.
 */
export class ToolError extends Error {
  readonly code: string
  readonly data?: unknown
  readonly retryable: boolean

  constructor(opts: {
    code: string
    data?: unknown
    message: string
    retryable?: boolean
    cause?: unknown
  }) {
    super(opts.message, { cause: opts.cause })
    this.name = "ToolError"
    this.code = opts.code
    this.data = opts.data
    this.retryable = opts.retryable ?? false
  }

  /** Render this error as a compact block the model can read. The code
   *  goes first (stable, model can branch on it), message next, optional
   *  `retry: true` marker. For `INVALID_INPUT` the message is already
   *  the annotated JSONC from `stringifyErrors` — passed through verbatim.
   *
   *  Distinct from `toString()` (which keeps the standard Error shape
   *  for generic error handlers / logs / telemetry). `format()` is the
   *  LLM-facing serialization. */
  format(): string {
    if (this.code === "INVALID_INPUT") return `❌ ${this.code}\n${this.message}`
    const lines = [`❌ ${this.code}: ${this.message}`]
    if (this.retryable) lines.push("retry: true")
    return lines.join("\n")
  }

  static from(error: unknown): ToolError {
    if (error instanceof ToolError) return error
    return new ToolError({
      cause: error,
      code: "INTERNAL",
      message: error instanceof Error ? error.message : String(error),
    })
  }
}

/** Declarative tool factory. Wires `validateInput` and (optionally)
 *  `validateOutput` from TypeBox schemas: inputs are coerced then
 *  validated (LLM-lenient), outputs are validated strictly (tool bug
 *  if shape drifts).
 *
 *  `execute` receives the fully-validated `Static<S>` type — no need
 *  to narrow or parse inside the handler.
 *
 *  ```ts
 *  const Search = defineTool({
 *    name: "search",
 *    input: Type.Object({ query: Type.String(), limit: Type.Number({ default: 10 }) }),
 *    execute: async ({ query, limit }) => { … },
 *  })
 *  ``` */
export function defineTool<Params extends TObject, Result extends TSchema = TSchema>(def: {
  desc?: string
  call: (args: Static<Params>, ctx: ToolContext) => Static<Result> | Promise<Static<Result>>
  name: string
  params: Params
  parallel?: boolean
  result?: Result
}): Tool<Static<Params>, Static<Result>> {
  const compiledParams = Schema.Compile(def.params)
  const compiledResult = def.result ? Schema.Compile(def.result) : undefined
  // oxlint-disable-next-line sort-keys
  return {
    name: def.name,
    desc: def.desc,
    params: def.params,
    parallel: def.parallel,
    result: def.result,
    call: async (args, ctx) => def.call(args, ctx),
    validateParams(args: unknown): Static<Params> {
      const coerced = coerce(def.params, args)
      if (compiledParams.Check(coerced)) return coerced
      const [, errors] = compiledParams.Errors(coerced)
      throw new ToolError({
        code: "INVALID_INPUT",
        data: errors,
        message: stringifyErrors(def.params, coerced, errors),
      })
    },
    validateResult: compiledResult
      ? (result: unknown): Awaited<Static<Result>> =>
          compiledResult.Parse(result) as Awaited<Static<Result>>
      : undefined,
  }
}

/** Parse and validate raw tool arguments. JSON-string inputs are decoded
 *  first; the result is run through `tool.validateParams` (which coerces
 *  LLM quirks before strict schema check). Throws `ToolError` on parse
 *  or validation failure — callers wrap with `formatToolError` to land
 *  back on a `ToolResult`. */
export function validateToolParams<I>(tool: Tool<I>, rawArgs: unknown): I {
  let args = rawArgs
  if (typeof args === "string") {
    const parsed = parseJson(args)
    if (!parsed.success) {
      throw new ToolError({ code: "INVALID_INPUT", message: `invalid JSON: ${parsed.error}` })
    }
    args = parsed.data
  }
  return tool.validateParams(args)
}

/** Wrap any thrown value as a `ToolResult` with `isError: true`. The
 *  formatted message lands in `content` so the model can read it; the
 *  structured `error` field carries the same info for downstream
 *  consumers (TUI badges, telemetry). Identical for `ToolError` and
 *  generic throws — the latter are coerced via `ToolError.from`. */
export function formatToolError(err: unknown): ToolResult {
  const te = ToolError.from(err)
  return {
    content: te.format(),
    error: {
      code: te.code,
      data: te.data,
      message: te.message,
      retryable: te.retryable,
    },
    isError: true,
  }
}

/** Build a successful `ToolResult` from a tool's raw return value. Runs
 *  the optional `validateResult` schema (strict — drift is a tool bug)
 *  and normalises the value into the parts shape. `meta` comes from the
 *  per-call `ctx.meta` slot the harness manages. */
export function formatToolResult<O>(
  tool: Tool<unknown, O>,
  raw: Awaited<O>,
  meta?: ToolResult["meta"]
): ToolResult {
  const validated = tool.validateResult ? tool.validateResult(raw) : raw
  return { content: normalizeToolReply(validated), isError: false, meta }
}

/** Pull the per-call sidecar slot off a ctx, returning `undefined` when
 *  the tool didn't write anything. The harness sets `ctx.meta = {}` on
 *  a per-call copy before invoking the tool; this helper centralises
 *  the "absent if empty" rule so result shapes stay clean. */
export function readToolMeta(ctx: ToolContext): ToolResult["meta"] {
  return Object.keys(ctx.meta ?? {}).length > 0 ? ctx.meta : undefined
}

/** Execute a tool end-to-end: parse (if string) → validateInput →
 *  execute → validateOutput (if declared). Every failure path returns
 *  a `ToolResult` with `isError: true` and a model-readable message —
 *  the caller never has to try/catch.
 *
 *  The formatted error on `INVALID_INPUT` is annotated JSONC from
 *  `stringifyErrors`, which the model can patch up and retry; on
 *  `INVALID_OUTPUT` or `INTERNAL` the format is a short code + message
 *  block the model can quote back but shouldn't try to "fix."
 *
 *  Streamable returns are blocked on — `runTool` awaits the streamable's
 *  `done` and surfaces the final snapshot. Use `Tasks.run` (in `@zaly/agent`)
 *  if you want grace-window promotion to background tasks instead.
 *
 *  This is the convenience all-in-one wrapper. Long-running harnesses
 *  compose `validateToolParams` / `formatToolResult` / `formatToolError`
 *  directly so they can interleave streamable detection between
 *  `tool.call` and result formatting.
 */
export async function runTool<I, O>(
  tool: Tool<I, O>,
  rawArgs: unknown,
  ctx: ToolContext
): Promise<ToolResult>
export async function runTool<I, O>(
  tool: Tool<I, O>,
  rawArgs: unknown,
  ctx: ToolContext,
  opts: { streaming: true }
): Promise<ToolResult | Streamable>
export async function runTool<I, O>(
  tool: Tool<I, O>,
  rawArgs: unknown,
  ctx: ToolContext,
  opts?: { streaming?: boolean }
): Promise<ToolResult | Streamable> {
  ctx = { ...ctx, meta: {} }
  const streaming = opts?.streaming ?? false

  let params: I
  try {
    params = validateToolParams(tool, rawArgs)
  } catch (error) {
    return formatToolError(error)
  }

  let result: Awaited<O>
  try {
    result = await tool.call(params, ctx)
  } catch (error) {
    return formatToolError(error)
  }

  if (isStreamable(result)) {
    if (streaming) {
      // Streaming caller (Tasks.run) wants the Streamable handle so it
      // can attach to the round race / promote to a background task.
      // Don't validate or normalise — the snapshot's content shape is
      // the tool's contract, not the declared `Result` schema.
      return result
    }
    // Block until completion, then surface the final snapshot. No
    // promotion path here — that's `Tasks.run`'s job.
    await result.done
    const snap = result.poll()
    return {
      content: snap.content,
      error: snap.error,
      isError: snap.isError,
      meta: snap.meta ?? readToolMeta(ctx),
    }
  }

  return formatToolResult(tool, result, readToolMeta(ctx))
}

const PART_TYPES = new Set(["text", "meta", "image", "pdf", "audio", "video"])

function isContentPart(v: unknown): v is TextPart | MetaPart | Attachment {
  return (
    typeof v === "object" &&
    v !== null &&
    "type" in v &&
    typeof (v as { type: unknown }).type === "string" &&
    PART_TYPES.has((v as { type: string }).type)
  )
}

/** Map a tool's return value into the `ToolResult.content` shape:
 *  - string → as-is (no `format`)
 *  - undefined → "" (no `format`)
 *  - single Part → wrapped in array
 *  - array of Parts → used as-is
 *  - everything else (object / array / number / boolean / null) →
 *    JSON-stringified, wrapped in a `TextPart` with `format: "json"`
 *    so renderers can pick `util.inspect` / a JSON highlighter / etc. */
function normalizeToolReply(value: unknown): string | (TextPart | MetaPart | Attachment)[] {
  if (typeof value === "string") return value
  if (value === undefined) return ""
  if (Array.isArray(value) && value.length > 0 && value.every(isContentPart)) {
    return value
  }
  if (isContentPart(value)) return [value]
  return [{ format: "json", text: safeStringify(value), type: "text" }]
}

/** Convert a `MetaPart` to a wire-friendly `TextPart` by JSON-stringifying
 *  the data and wrapping in an XML-style tag the model can recognize.
 *  String `data` is used verbatim (natural for `tag: "system"` use);
 *  anything else goes through `safeStringify`.
 *
 *  Tag names get the strip-then-fallback treatment so a malformed `tag`
 *  ("tool meta") doesn't produce broken XML — drops to "meta". */
export function toTextPart(part: MetaPart): TextPart {
  const cleaned = (part.tag ?? "meta").replace(/[^A-Za-z0-9-]/g, "")
  const tag = cleaned === "" ? "meta" : cleaned
  const body = typeof part.data === "string" ? part.data : safeStringify(part.data)
  return { text: `<${tag}>${body}</${tag}>`, type: "text" }
}

/** Flatten any `MetaPart`s in a content array into `TextPart`s, leaving
 *  other parts untouched. Provider adapters call this before iterating
 *  content for wire translation. */
export function flattenMeta(
  content: string | (TextPart | MetaPart | Attachment)[]
): string | (TextPart | Attachment)[] {
  if (typeof content === "string") return content
  return content.map((p) => (p.type === "meta" ? toTextPart(p) : p))
}

/** Collapse a system message's content to a single string. Used at
 *  provider boundaries because both Anthropic (top-level `system` slot)
 *  and OpenAI (`role: "system"` content) take strings only. MetaParts
 *  flatten to their `<tag>JSON</tag>` form; text parts join with newlines. */
export function stringifySystemContent(content: string | (TextPart | MetaPart)[]): string {
  if (typeof content === "string") return content
  return content.map((p) => (p.type === "meta" ? toTextPart(p).text : p.text)).join("\n")
}

/** Serialize a tool-result `content` value to a single string —
 *  the lowest-common-denominator shape for providers whose tool message
 *  is string-only (e.g. OpenAI Chat Completions, even after the rich-
 *  content fallback splits attachments off into a separate user
 *  message; the tool message itself still wants a string body).
 *
 *  - `string` → passes through verbatim.
 *  - array → text parts joined with newlines; meta parts get flattened
 *    via `toTextPart` first; non-text/non-meta parts replaced with a
 *    `[image]` / `[pdf]` / etc. placeholder so the model has *some*
 *    hint that an attachment lives in the next message. */
export function stringifyToolResult(
  content: string | (TextPart | MetaPart | Attachment)[]
): string {
  if (typeof content === "string") return content
  return content
    .map((p) => {
      if (p.type === "text") return p.text
      if (p.type === "meta") return toTextPart(p).text
      return `[${p.type}]`
    })
    .join("\n")
}

/** Returns true if any non-text part is present in a tool-result
 *  content value — signal to provider adapters that a fallback emit
 *  may be needed. */
export function hasAttachments(content: string | (TextPart | MetaPart | Attachment)[]): boolean {
  if (typeof content === "string") return false
  return content.some((p) => p.type !== "text" && p.type !== "meta")
}
