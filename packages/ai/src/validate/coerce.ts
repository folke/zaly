import { Value } from "typebox/value"

/** Best-effort coercion of LLM-generated args into a schema's shape.
 *
 *  Applies three lenient transforms in order:
 *    1. `Convert` — primitive coercion (`"42"` → `42`, `"true"` → `true`)
 *    2. `Default` — fill missing fields with schema defaults
 *    3. `Clean`   — strip properties not declared in the schema
 *
 *  Never throws and never validates. The caller should follow up with
 *  a compiled `.Check`/`.Errors` step to confirm the shape actually
 *  matches before use.
 */
export function coerce(
  schema: {},
  value: unknown,
  opts: { convert?: boolean; defaults?: boolean; clean?: boolean } = {}
): unknown {
  let ret = value
  if (opts.defaults ?? true) ret = Value.Default(schema, ret)
  if (opts.convert ?? true) ret = Value.Convert(schema, ret)
  if (opts.clean ?? true) ret = Value.Clean(schema, ret)
  return ret
}
