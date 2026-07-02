import type { ErrorCode, ErrorInfo } from "./types.ts"

/**
 * Throwable structured error for the zaly AI layer.
 *
 * Carries an `ErrorInfo` payload (`code`, `message`, optional `data` /
 * `retryable`) plus a runtime `cause` chain. Producers — tools, format
 * pipelines, fetch helpers, anywhere a "recoverable, model-readable"
 * failure happens — throw `AiError`; consumers (the tool runner, the
 * agent loop) serialize the structured subset to the wire as an
 * `ErrorPart` (via `toErrorPart`) and surface `ErrorInfo` on
 * `ToolResult.error` / `ToolResultPart.error` for telemetry / TUI.
 *
 * Anything else thrown is folded through `AiError.from(err)` with a
 * generic `ERROR` code — genuine bugs shouldn't be teaching the model
 * new escape hatches, and downstream consumers still get a stable
 * shape to render.
 */
export class AiError extends Error implements ErrorInfo {
  readonly code: ErrorCode
  readonly data?: unknown
  readonly retryable?: boolean

  constructor(opts: ErrorInfo & { cause?: unknown }) {
    super(opts.message, { cause: opts.cause })
    this.name = "AiError"
    this.code = opts.code
    this.data = opts.data
    this.retryable = opts.retryable
  }

  /** Coerce any thrown value into an `AiError`. `AiError` passes through;
   *  values that already match `ErrorInfo` (raw object literals from
   *  serialized state) are wrapped; everything else becomes
   *  `{ code: "ERROR", message: String(err) }` with the original value
   *  preserved on `cause`.
   *
   *  `opts` overrides any inferred fields — pass it when the caller wants
   *  to attach context (e.g. force `code: "TIMEOUT"` for a fetch abort
   *  whose underlying message is generic). */
  static from(error: unknown, opts?: Partial<ErrorInfo>): AiError {
    if (error instanceof AiError) return error
    if (isErrorInfo(error))
      return new AiError({
        code: error.code,
        data: error.data,
        message: error.message,
        retryable: error.retryable,
        ...opts,
      })
    return new AiError({
      cause: error,
      code: "ERROR",
      message: error instanceof Error ? error.message : String(error),
      ...opts,
    })
  }
}

export function isErrorInfo(value: unknown): value is ErrorInfo {
  if (typeof value !== "object" || value === null) return false
  const v = value as Record<string, unknown>
  return typeof v.code === "string" && typeof v.message === "string"
}
