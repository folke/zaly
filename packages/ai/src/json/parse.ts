/**
 * Lenient JSON parser for LLM-generated output.
 *
 * The flow:
 *   1. Strip obvious envelope noise (markdown code fences, a leading
 *      prose prefix, leading whitespace).
 *   2. Try `JSON.parse` first — the happy path for well-formed args.
 *   3. Fall back to `jsonrepair` — handles missing commas, smart
 *      quotes, Python-style booleans, trailing commas, unquoted
 *      keys, truncation, and dozens of other malformed-JSON shapes
 *      LLMs emit in the wild.
 *
 * Returns a discriminated result rather than throwing — callers always
 * know whether they have a parsed value or a failure reason. The
 * coerce/validate steps further up the pipeline never see exceptions
 * from parse.
 */
import { jsonrepair } from "jsonrepair"

export type ParseResult<T = unknown> =
  | { success: true; data: T; repaired: boolean }
  | { success: false; error: string }

/** Parse possibly-malformed JSON.
 *
 *  `repaired: true` signals that `jsonrepair` had to step in — useful
 *  telemetry for tracking how often models produce broken JSON, which
 *  correlates strongly with weaker models and temperature > 0.
 *
 *  ```ts
 *  const result = parseJson(rawArgs)
 *  if (!result.success) …          // syntactically unsalvageable
 *  if (result.repaired) tel.increment("json.repaired")
 *  ```
 */
export function parseJson<T = unknown>(input: string): ParseResult<T> {
  const cleaned = stripEnvelope(input)
  if (cleaned === "") {
    return { error: "empty input", success: false }
  }

  try {
    return { data: JSON.parse(cleaned) as T, repaired: false, success: true }
  } catch {
    // Fall through to repair.
  }

  try {
    const repaired = jsonrepair(cleaned)
    return { data: JSON.parse(repaired) as T, repaired: true, success: true }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      success: false,
    }
  }
}

// ── envelope stripping ────────────────────────────────────────────────────
//
// jsonrepair handles most wrapper noise natively — markdown fences,
// JSONP calls, trailing `` ``` ``, truncation. The one case it trips
// on is a leading prose prefix like "Here is the JSON: {...}", which
// it turns into a string literal rather than isolating the JSON. So
// we run one narrow strip for that.

/** Strip whitespace + prose prefix before the first structural opener. */
function stripEnvelope(input: string): string {
  const s = input.trim()
  if (s === "") return s
  const candidates = [s.indexOf("{"), s.indexOf("[")].filter((i) => i !== -1)
  if (candidates.length === 0) return s
  const first = Math.min(...candidates)
  if (first <= 0) return s
  // Only slice when the prefix is prose — leading non-alpha junk
  // (e.g. `\`\`\`json`) is jsonrepair's territory and we shouldn't
  // second-guess it.
  const prefix = s.slice(0, first)
  return /[a-zA-Z]/.test(prefix) ? s.slice(first) : s
}
