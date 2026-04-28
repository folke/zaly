import type { Static, TObject, TSchema } from "typebox"
import type {
  Attachment,
  MetaPart,
  TextPart,
  Tool,
  ToolContext,
  ToolErrorInfo,
  ToolMeta,
} from "./types.ts"

import { safeStringify } from "@zaly/shared"
import Schema from "typebox/schema"
import { coerce } from "./json/coerce.ts"
import { parseJson } from "./json/parse.ts"
import { stringifyErrors } from "./json/stringify.ts"

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

/** Normalised tool execution outcome — maps 1:1 to `ToolResultPart`.
 *  `isError: true` is the LLM-facing signal that the call failed; the
 *  `content` field carries the tool's success output (string or rich
 *  part array) or a formatted error payload the model should read.
 *  `error` carries structured info for richer downstream rendering. */
export interface ToolResult {
  isError: boolean
  content: string | (TextPart | MetaPart | Attachment)[]
  error?: ToolErrorInfo
  /** Whatever the tool wrote to `ctx.meta` during the call. `runTool`
   *  hands each call a fresh empty `meta` slot on a per-call ctx copy,
   *  reads it back after the call, and surfaces it here only when
   *  non-empty. Wire-invisible — providers never see this. Used by
   *  cross-tool plumbing like file-freshness tracking; see `ToolMeta`
   *  in `@zaly/ai/types` for the extension pattern. */
  meta?: ToolMeta
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
  result?: Result
}): Tool<Static<Params>, Static<Result>> {
  const compiledParams = Schema.Compile(def.params)
  const compiledResult = def.result ? Schema.Compile(def.result) : undefined
  // oxlint-disable-next-line sort-keys
  return {
    name: def.name,
    desc: def.desc,
    params: def.params,
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

/** Execute a tool end-to-end: parse (if string) → validateInput →
 *  execute → validateOutput (if declared). Every failure path returns
 *  a `ToolResult` with `isError: true` and a model-readable message —
 *  the caller never has to try/catch.
 *
 *  The formatted error on `INVALID_INPUT` is annotated JSONC from
 *  `stringifyErrors`, which the model can patch up and retry; on
 *  `INVALID_OUTPUT` or `INTERNAL` the format is a short code + message
 *  block the model can quote back but shouldn't try to "fix."
 */
export async function runTool<I, O>(
  tool: Tool<I, O>,
  rawArgs: unknown,
  ctx: ToolContext
): Promise<ToolResult> {
  ctx = { ...ctx, meta: {} }
  let args = rawArgs
  if (typeof args === "string") {
    const parsed = parseJson(args)
    if (!parsed.success) {
      return toErrorResult(
        new ToolError({ code: "INVALID_INPUT", message: `invalid JSON: ${parsed.error}` })
      )
    }
    args = parsed.data
  }

  let params: I
  try {
    params = tool.validateParams(args)
  } catch (error) {
    return toErrorResult(error)
  }

  let result: Awaited<O>
  try {
    result = await tool.call(params, ctx)
  } catch (error) {
    return toErrorResult(error)
  }

  if (tool.validateResult) {
    result = tool.validateResult(result)
  }
  const meta = Object.keys(ctx.meta ?? {}).length > 0 ? ctx.meta : undefined

  return { content: normalizeToolReply(result), isError: false, meta }
}

function toErrorResult(err: unknown): ToolResult {
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
