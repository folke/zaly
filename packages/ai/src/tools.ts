import type { Static, TObject, TSchema } from "typebox"
import type { Streamable, Tool, ToolContext, ToolErrorInfo, ToolResult } from "./types.ts"

import Schema from "typebox/schema"
import { toContent } from "./format.ts"
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
function validateToolParams<I>(tool: Tool<I>, rawArgs: unknown): I {
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

/** Wrap any thrown value as a `ToolResult` with `isError: true`.
 *
 *  The `content` carries two things:
 *    - an `<error>` MetaPart with the parts the body doesn't already
 *      convey (`code`, optional structured `data`, optional `retryable`)
 *      — so the model can branch on `code` programmatically without
 *      re-parsing the human text;
 *    - the formatted human-readable error block (`❌ CODE: message`)
 *      as a TextPart, which carries the message verbatim.
 *
 *  `message` is intentionally NOT in the MetaPart — it lives in the
 *  TextPart, no need to duplicate it on the wire. The full structured
 *  info (including `message`) is still on `ToolResult.error` as a
 *  sidecar for downstream consumers (TUI badges, telemetry). Identical
 *  for `ToolError` and generic throws — the latter are coerced via
 *  `ToolError.from`. */
export function formatToolError(err: unknown): ToolResult {
  const te = ToolError.from(err)
  const error: ToolErrorInfo = {
    code: te.code,
    data: te.data,
    message: te.message,
    retryable: te.retryable,
  }
  // Strip `message` from the MetaPart payload — the formatted body
  // already shows it. `data` and `retryable` drop via JSON when absent.
  const wireError: Record<string, unknown> = { code: te.code }
  if (te.data !== undefined) wireError.data = te.data
  if (te.retryable) wireError.retryable = true
  return {
    content: [
      { data: wireError, tag: "error", type: "meta" },
      { text: te.format(), type: "text" },
    ],
    error,
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
  return { content: toContent(validated), isError: false, meta }
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
 *  pass `{ streaming: true }` to opt out of the block-on-streamable
 *  behaviour and get the `Streamable` handle for grace-window racing.
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

