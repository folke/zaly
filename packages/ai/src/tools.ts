import type { Static, TObject, TSchema } from "typebox"
import type { Tool } from "./types.ts"

import { coerce } from "./json/coerce.ts"
import { parseJson } from "./json/parse.ts"
import { stringifyErrors } from "./json/stringify.ts"
import { validate } from "./json/validate.ts"

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
}

/** Normalised tool execution outcome — maps 1:1 to `ToolResultPart`.
 *  `isError: true` is the LLM-facing signal that the call failed; the
 *  `result` field carries either the tool's success output or a
 *  formatted error payload the model should read. */
export interface ToolResult {
  isError: boolean
  result: unknown
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
  call: (args: Static<Params>) => Static<Result> | Promise<Static<Result>>
  name: string
  params: Params
  result?: Result
}): Tool<Static<Params>, Static<Result>> {
  // oxlint-disable-next-line sort-keys
  return {
    name: def.name,
    desc: def.desc,
    params: def.params,
    result: def.result,
    call: async (args) => def.call(args),
    validateParams(args: unknown): Static<Params> {
      const coerced = coerce(def.params, args)
      const result = validate(def.params, coerced)
      if (result.success) return result.data
      throw new ToolError({
        code: "INVALID_INPUT",
        data: result.errors,
        message: stringifyErrors(def.params, coerced, result.errors),
      })
    },
    validateResult: def.result
      ? (result: unknown): Static<Result> => {
          const outputSchema = def.result as Result
          const r = validate(outputSchema, result)
          if (r.success) return r.data
          throw new ToolError({
            code: "INVALID_OUTPUT",
            data: r.errors,
            message: stringifyErrors(outputSchema, result, r.errors),
          })
        }
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
export async function runTool<I, O>(tool: Tool<I, O>, rawArgs: unknown): Promise<ToolResult> {
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

  let input: I
  try {
    input = tool.validateParams(args)
  } catch (error) {
    return toErrorResult(error)
  }

  let output: O
  try {
    output = await tool.call(input)
  } catch (error) {
    return toErrorResult(error)
  }

  if (tool.validateResult) {
    try {
      output = tool.validateResult(output)
    } catch (error) {
      return toErrorResult(error)
    }
  }

  return { isError: false, result: output }
}

function toErrorResult(err: unknown): ToolResult {
  if (err instanceof ToolError) {
    return {
      isError: true,
      result: formatToolError(err),
    }
  }
  const message = err instanceof Error ? err.message : String(err)
  return {
    isError: true,
    result: formatToolError(new ToolError({ code: "INTERNAL", message })),
  }
}

/** Serialize a tool result for the wire.
 *
 *  Every provider expects a string (OpenAI `tool` message `content`,
 *  Anthropic `tool_result.content` in its string form, Gemini
 *  `functionResponse.response` — stringified for models that don't
 *  accept raw objects). We keep `ToolResult.result` as `unknown` so
 *  handlers return what's natural (`"hello"` vs `{ x: 1 }` vs `5`)
 *  and collapse to a string here at the adapter boundary.
 *
 *    - `string` passes through verbatim — no extra quoting that
 *      would make the model parse around.
 *    - everything else goes through `JSON.stringify`. Objects,
 *      arrays, numbers, booleans, `null` all round-trip cleanly.
 *    - `undefined` / `NaN` / circular refs → the adapter gets
 *      `"null"` / a best-effort stringification; they're tool
 *      bugs the model can't fix, so we don't try to paper over them.
 */
export function stringifyToolResult(result: unknown): string {
  return typeof result === "string" ? result : JSON.stringify(result)
}

/** Format a ToolError into a compact block the model can read. The
 *  code goes first (stable, model can branch on it), message next,
 *  optional `retry: true` marker, and for `INVALID_INPUT` the message
 *  is already the annotated JSONC — passed through verbatim. */
export function formatToolError(err: ToolError): string {
  if (err.code === "INVALID_INPUT") {
    return `❌ ${err.code}\n${err.message}`
  }
  const lines = [`❌ ${err.code}: ${err.message}`]
  if (err.retryable) lines.push("retry: true")
  return lines.join("\n")
}
