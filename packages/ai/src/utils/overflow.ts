/**
 * Post-hoc context-overflow detection. Compaction should normally
 * fire preemptively once `usage.input / limit.context` crosses some
 * threshold (90% is a reasonable default), but this handles the
 * cases that slip through:
 *
 *  - **First-turn overflow** — no prior usage report to consult; the
 *    user's initial prompt is already over budget.
 *  - **Silent-overflow providers** — some endpoints (z.ai, Ollama in
 *    some configs) accept the request without erroring and either
 *    truncate input or hallucinate their way through. Detectable via
 *    a usage-vs-limit comparison once the response comes back.
 *  - **Catalog drift** — a model's real context window shifted and
 *    our cached `limit.context` is stale. Error surfaces, we catch.
 *
 * Error messages are regex-matched against a curated list per
 * provider. When a new provider shows up with a new error shape, add
 * one entry to `OVERFLOW_PATTERNS`.
 *
 * Independent implementation; same problem space as pi-mono's
 * overflow utility — worth looking at their patterns for reference:
 *   @see https://github.com/badlogic/pi-mono/blob/main/packages/ai/src/utils/overflow.ts
 */

/** Strings the provider emits when rejecting for context overflow.
 *  One match = definite overflow. Order is irrelevant. */
const OVERFLOW_PATTERNS: RegExp[] = [
  // Anthropic
  /prompt is too long/i,
  /request_too_large/i,
  // OpenAI completions / OpenRouter (both upstream and passthrough)
  /maximum context length/i,
  /exceeds the context window/i,
  // Google Gemini
  /input token count exceeds/i,
  // xAI Grok
  /maximum prompt length/i,
  // Groq
  /reduce the length of the messages/i,
  // Mistral
  /too large for model with \d+ maximum context length/i,
  // z.ai silent-overflow surfaces via this finish-reason-as-error
  /model_context_window_exceeded/i,
  // llama.cpp / LM Studio / Ollama variants
  /exceeds the available context size/i,
  /greater than the context length/i,
  /prompt too long.{0,40}exceed(?:ed|s)? (?:max )?context length/i,
  // Moonshot Kimi
  /exceeded model token limit/i,
]

/** Strings that superficially look like overflow but are rate-limit /
 *  throttling / generic error messages. Subtracted first so e.g.
 *  "too many requests" doesn't get misclassified by a /too many/i
 *  pattern elsewhere. */
const NOT_OVERFLOW_PATTERNS: RegExp[] = [
  /rate limit/i,
  /too many requests/i,
  /throttling/i,
  /service unavailable/i,
]

export interface OverflowCheck {
  /** Error message from the response, if the request failed. Checked
   *  against the regex catalog. Pass the raw message string — not the
   *  Error object — so callers can pre-extract from native errors,
   *  response bodies, or structured error responses uniformly. */
  message?: string
  /** `usage.input + usage.cachedInput` from a successful response.
   *  Combined with `contextLimit` detects silent overflow — providers
   *  that accept out-of-budget requests and truncate rather than
   *  error. Cached input still counts against the window. */
  usageInput?: number
  /** The model's declared context window
   *  (`ModelOptions.limit.context`). Without this, silent-overflow
   *  detection is skipped. */
  contextLimit?: number
}

/**
 * Whether a response indicates the request overflowed the model's
 * context window.
 *
 * ```ts
 * // After a stream error:
 * if (isContextOverflow({ message: err.message })) {
 *   await compact()
 *   retry()
 * }
 *
 * // After a successful turn, to catch silent-overflow providers:
 * if (isContextOverflow({
 *   usageInput: usage.input + (usage.cachedInput ?? 0),
 *   contextLimit: model.options.limit.context,
 * })) {
 *   await compact()
 * }
 * ```
 */
export function isContextOverflow(check: OverflowCheck): boolean {
  const { message, usageInput, contextLimit } = check

  if (message !== undefined && message !== "") {
    // Disqualify obvious non-overflow errors first; some of the
    // overflow patterns are loose enough that a rate-limit message
    // could otherwise slip through.
    if (NOT_OVERFLOW_PATTERNS.some((re) => re.test(message))) return false
    if (OVERFLOW_PATTERNS.some((re) => re.test(message))) return true
  }

  // Silent overflow: provider accepted but reported an input count
  // that exceeds the window. Applies after-the-fact — next turn
  // should compact.
  if (
    usageInput !== undefined &&
    contextLimit !== undefined &&
    contextLimit > 0 &&
    usageInput > contextLimit
  ) {
    return true
  }

  return false
}
