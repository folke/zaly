/**
 * `Validator` owns the per-tool compile state for params + result
 * schemas. Constructed cheaply at `defineTool` time (stores schemas
 * only); typebox runtime + coerce/stringify helpers are lazy-imported
 * on the first validation call and memoized on the instance.
 *
 * Net effect: `import "@zaly/ai"` and `defineTool({...})` are
 * typebox-free at module top. The cost shifts to the first
 * `tool.validator.validateParams(...)` call (one-time ~50ms cold), with
 * every subsequent call going through the cached compiled artifact.
 */

import type { Validator as Compiled } from "typebox/schema"
import type { Static, TObject, TSchema } from "typebox/type"
import type { coerce } from "./coerce.ts"

import { AiError } from "../error.ts"
import { parseJson } from "../utils/json.ts"

export class Validator<
  P extends TObject = TObject,
  R extends TSchema | undefined = TSchema | undefined,
> {
  #params?: Promise<Compiled>
  #result?: Promise<Compiled>
  #defaults?: unknown

  constructor(
    public readonly params: P,
    public readonly result?: R
  ) {}

  /** Coerces and diffs raw input against the schema defaults, returning
   * only the explicitly provided properties. */
  async cleanParams(raw: unknown): Promise<unknown> {
    const { Value } = await import("typebox/value")
    this.#defaults ??= Value.Default(this.params, {})
    const coerced = await this.#coerce(raw)
    const diff = Value.Diff(this.#defaults, coerced)
    return Value.Patch({}, diff)
  }

  async #coerce(raw: unknown, opts: Parameters<typeof coerce>[2] = {}): Promise<unknown> {
    let args = raw
    if (typeof args === "string") {
      const parsed = await parseJson(args)
      if (!parsed.success) {
        throw new AiError({ code: "INVALID_INPUT", message: `invalid JSON: ${parsed.error}` })
      }
      args = parsed.data
    }

    const { coerce } = await import("./coerce.ts")
    return coerce(this.params, args, opts)
  }

  /** Validate raw tool arguments. Accepts either an already-parsed
   *  value or a JSON string (parsed lazily via `parseJson`). Coerces
   *  LLM quirks, checks against the schema, and throws an `AiError`
   *  with annotated JSONC on failure. */
  async validateParams(raw: unknown): Promise<Static<P>> {
    const coerced = await this.#coerce(raw)
    this.#params ??= this.#compile(this.params)
    const compiled = await this.#params
    if (compiled.Check(coerced)) return coerced as Static<P>

    const { stringifyErrors } = await import("./stringify.ts")
    const [, errors] = compiled.Errors(coerced)
    throw new AiError({
      code: "INVALID_INPUT",
      data: errors,
      message: stringifyErrors(this.params, coerced, [...errors]),
    })
  }

  /** Strict result validation. Drift is a tool bug — throws on
   *  mismatch. Returns `raw` untouched when no result schema was
   *  declared. */
  async validateResult(raw: unknown): Promise<R extends TSchema ? Static<R> : unknown> {
    if (!this.result) return raw as R extends TSchema ? Static<R> : unknown
    this.#result ??= this.#compile(this.result)
    const compiled = await this.#result
    return compiled.Parse(raw) as R extends TSchema ? Static<R> : unknown
  }

  async #compile(schema: TSchema): Promise<Compiled> {
    const { Compile } = await import("typebox/schema")
    // oxlint-disable-next-line new-cap
    return Compile(schema)
  }
}
