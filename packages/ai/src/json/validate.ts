import type { Static, TSchema } from "typebox"
import type { TLocalizedValidationError } from "typebox/error"
import { Value } from "typebox/value"

export type ValidateResult<T> =
  | { success: true; data: T }
  | { success: false; errors: TLocalizedValidationError[] }

/** Ad-hoc schema validation. Wraps TypeBox's `Value.Check`/`Value.Errors`
 *  in a discriminated result so callers don't have to pattern-match
 *  on a tuple or catch exceptions.
 *
 *  This walks the schema each call. For hot paths (e.g. tool argument
 *  validation that runs every turn) compile the schema once via
 *  `Schema.Compile(schema)` and call `.Check`/`.Errors` directly —
 *  `defineTool` does that internally.
 */
export function validate<S extends TSchema>(schema: S, value: unknown): ValidateResult<Static<S>> {
  if (Value.Check(schema, value)) return { data: value, success: true }
  return { errors: Value.Errors(schema, value), success: false }
}
