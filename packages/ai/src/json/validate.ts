import type { Static, TSchema } from "typebox"
import type { TLocalizedValidationError } from "typebox/error"
import { Value } from "typebox/value"

export type ValidateResult<T> =
  | { success: true; data: T }
  | { success: false; errors: TLocalizedValidationError[] }

/** Validate `value` against `schema`.
 *
 *  Uses TypeBox's fast `Check` on the happy path and only pays for
 *  `Errors` when validation fails. Returns a discriminated result so
 *  callers never have to pattern-match on exceptions.
 */
export function validate<S extends TSchema>(
  schema: S,
  value: unknown,
): ValidateResult<Static<S>> {
  if (Value.Check(schema, value)) {
    return { data: value, success: true }
  }
  return { errors: Value.Errors(schema, value), success: false }
}
