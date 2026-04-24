import type { Static, TSchema } from "typebox"

import { Value } from "typebox/value"

/** Best-effort coercion of LLM-generated args into a schema's shape.
 *
 *  Applies three lenient transforms in order:
 *    1. `Convert` — primitive coercion (`"42"` → `42`, `"true"` → `true`)
 *    2. `Default` — fill missing fields with schema defaults
 *    3. `Clean`   — strip properties not declared in the schema
 *
 *  Never throws and never validates. The caller should follow up with
 *  `validate()` to confirm the shape actually matches before use.
 */
export function coerce<S extends TSchema>(schema: S, value: unknown): Static<S> {
  const converted = Value.Convert(schema, value)
  const defaulted = Value.Default(schema, converted)
  return Value.Clean(schema, defaulted) as Static<S>
}
