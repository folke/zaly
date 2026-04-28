/** Null byte + control chars excluding tab (9), LF (10), CR (13).
 *  Same heuristic the read tool uses — flags binary streams that
 *  shouldn't be displayed inline. */
const BINARY_BYTE_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F]/

const HEAD_LINES = 100
const TAIL_LINES = 100

export interface SummarizedOutput {
  /** Possibly-truncated text the model should see inline. */
  text: string
  /** Total number of lines the source contained (before truncation). */
  totalLines: number
  /** True when `text` is a head+tail summary; false when it's the full
   *  content untouched. */
  truncated: boolean
}

export interface BinaryDetected {
  binary: true
  bytes: number
}

/**
 * Summarize a bash-style output buffer for inline display:
 *
 *   - **Binary content** (non-text control bytes) → `{ binary: true, bytes }`.
 *     Caller refuses with a "use the read tool" error rather than
 *     dumping unreadable bytes into the model's context.
 *   - **Under the line limit** → returned verbatim, `truncated: false`.
 *   - **Over the limit** → first 100 + last 100 lines, joined by an
 *     elision marker that points at the full log file path.
 *
 * Total line counts are returned so the caller can include them in a
 * structured `truncated` field alongside the on-disk log path.
 */
export function summarizeOutput(
  data: Buffer | string,
  opts: { logPath?: string; head?: number; tail?: number } = {}
): SummarizedOutput | BinaryDetected {
  const head = opts.head ?? HEAD_LINES
  const tail = opts.tail ?? TAIL_LINES

  const text = typeof data === "string" ? data : data.toString("utf8")
  if (text === "") return { text: "", totalLines: 0, truncated: false }

  // Binary sniff — sample the first 8KB so multi-megabyte buffers don't
  // pay a full scan.
  const sample = text.length > 8192 ? text.slice(0, 8192) : text
  if (BINARY_BYTE_RE.test(sample)) {
    return { binary: true, bytes: typeof data === "string" ? Buffer.byteLength(data) : data.length }
  }

  const lines = text.split("\n")
  // Drop the trailing empty line a final \n produces, so "3 lines\n" reads as 3.
  if (lines.at(-1) === "") lines.pop()

  if (lines.length <= head + tail) {
    return { text: lines.join("\n"), totalLines: lines.length, truncated: false }
  }

  const headSlice = lines.slice(0, head)
  const tailSlice = lines.slice(lines.length - tail)
  const elided = lines.length - head - tail
  const marker = opts.logPath
    ? `[ … ${elided} lines elided — full output: ${opts.logPath} ]`
    : `[ … ${elided} lines elided ]`

  return {
    text: [...headSlice, marker, ...tailSlice].join("\n"),
    totalLines: lines.length,
    truncated: true,
  }
}
