import type { Static, TObject, TSchema } from "typebox/type"
import type {
  Message,
  ParamsOf,
  Streamable,
  Tool,
  ToolCallPart,
  ToolContext,
  ToolResult,
} from "./types.ts"

import { safeParseJson } from "@zaly/shared"
import Schema from "typebox/schema"
import { toContent } from "./content/format.ts"
import { toErrorPart } from "./content/part.ts"
import { AiError } from "./error.ts"
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
export function defineTool<
  Params extends TObject,
  Result extends TSchema = TSchema,
  Meta extends object = object,
>(def: {
  desc?: string
  call: (args: Static<Params>, ctx: ToolContext<Meta>) => Static<Result> | Promise<Static<Result>>
  name: string
  params: Params
  parallel?: boolean
  result?: Result
}): Tool<Static<Params>, Static<Result>, Meta> {
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
      throw new AiError({
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
 *  LLM quirks before strict schema check). Throws `AiError` on parse
 *  or validation failure — callers wrap with `toErrorResult` to land
 *  back on a `ToolResult`. */
export function validateToolParams<I>(tool: Tool<I>, rawArgs: unknown): I {
  let args = rawArgs
  if (typeof args === "string") {
    const parsed = parseJson(args)
    if (!parsed.success) {
      throw new AiError({ code: "INVALID_INPUT", message: `invalid JSON: ${parsed.error}` })
    }
    args = parsed.data
  }
  return tool.validateParams(args)
}

/**
 * Drop unpaired tool calls and tool results from a message history.
 * Provider APIs require strict pairing: every assistant `tool-call`
 * must have a corresponding `tool-result` later in the array, and
 * vice versa. Orphans (typically left behind by a Ctrl+C during tool
 * execution, or a crash between call emission and result persistence)
 * cause hard failures — OpenAI Responses returns *"No tool output
 * found for function call …"*; Anthropic returns a similar
 * `tool_use_without_tool_result` error.
 *
 * The pass:
 *   - drops assistant `tool-call` parts whose id isn't in any later
 *     `tool` message;
 *   - drops `tool-result` parts whose id wasn't in any earlier
 *     assistant message;
 *   - drops assistant/tool messages that end up with zero parts.
 *
 * Pure function — never mutates the input. Cheap (two linear walks).
 * Called from `Model.stream` so every provider gets sanitised input.
 */
export function pairToolCalls(messages: readonly Message[]): Message[] {
  const resultIds = new Set<string>()
  const callIds = new Set<string>()
  for (const m of messages) {
    if (m.role === "tool") {
      for (const p of m.content) resultIds.add(p.id)
    } else if (m.role === "assistant" && Array.isArray(m.content)) {
      for (const p of m.content) {
        if (p.type === "tool-call") callIds.add(p.id)
      }
    }
  }

  const out: Message[] = []
  for (const m of messages) {
    if (m.role === "assistant" && Array.isArray(m.content)) {
      const filtered = m.content.filter((p) => p.type !== "tool-call" || resultIds.has(p.id))
      if (filtered.length === 0) continue
      out.push(filtered.length === m.content.length ? m : { ...m, content: filtered })
    } else if (m.role === "tool") {
      const filtered = m.content.filter((p) => callIds.has(p.id))
      if (filtered.length === 0) continue
      out.push(filtered.length === m.content.length ? m : { ...m, content: filtered })
    } else {
      out.push(m)
    }
  }
  return out
}

export function* extractToolCalls<T extends string = string>(
  messages: readonly Message[],
  tools?: T[]
): Generator<{ call: ToolCallPart<T>; idx: number; message: Message }> {
  for (let idx = messages.length - 1; idx >= 0; idx--) {
    const m = messages[idx]
    if (m.role !== "assistant" || typeof m.content === "string") continue
    for (const p of m.content) {
      if (p.type === "tool-call" && (tools === undefined || tools.includes(p.name as T)))
        yield { call: p as ToolCallPart<T>, idx, message: m }
    }
  }
}

/** Lightweight reader for a `ToolCallPart.params` value.
 *
 *  In the normal agent flow, the kernel pre-validates each tool call:
 *    `part.params = validateToolParams(tool, params) ?? params`
 *  So `params` is either:
 *    - the canonical, schema-coerced object (validation succeeded), or
 *    - the raw model output (validation failed) — usually a JSON string
 *      that may or may not parse, occasionally an object that didn't
 *      match the schema.
 *
 *  This helper accepts both. It JSON-parses if `params` is a string
 *  (no JSON repair) and returns the object as-is if it's already one.
 *  Anything else (parse error, null, primitives) yields `undefined`.
 *
 *  It does NOT validate against the tool's schema and does NOT coerce
 *  types — for that, use `validateToolParams`. Use this when you need
 *  a best-effort read of params for inspection (e.g. the masker
 *  pulling `path` for file ops), not when correctness depends on the
 *  shape being exactly `Params`. The return type is `Partial<...>` to
 *  remind callers that any field could legitimately be missing or
 *  off-shape on the failure path. */
export function safeParseToolParams<T extends Tool = Tool>(
  params: unknown
): Partial<ParamsOf<T>> | undefined {
  params = typeof params === "string" ? safeParseJson(params) : params
  return typeof params === "object" && params !== null
    ? (params as Partial<ParamsOf<T>>)
    : undefined
}

/** Wrap any thrown value as a `ToolResult` with `isError: true`. The
 *  thrown value is coerced via `AiError.from` and embedded as an
 *  `ErrorPart` in `content`; the same structured shape is also surfaced
 *  on the `.error` sidecar for downstream consumers (TUI badges,
 *  telemetry). At the wire boundary the `ErrorPart` folds to a
 *  `<error>` `MetaPart` via `errorToMeta()` (or equivalent). */
export function toErrorResult(err: unknown): ToolResult {
  const ep = toErrorPart(err)
  return { content: [ep], error: ep, isError: true }
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
 *  `INVALID_OUTPUT` or `ERROR` the format is a short code + message
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
    return toErrorResult(error)
  }

  let result: Awaited<O>
  try {
    result = await tool.call(params, ctx)
  } catch (error) {
    return toErrorResult(error)
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
