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
  logPath?: string
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
  opts: { logPath?: string | (() => string | undefined); head?: number; tail?: number } = {}
): SummarizedOutput {
  const head = opts.head ?? HEAD_LINES
  const tail = opts.tail ?? TAIL_LINES

  const text = typeof data === "string" ? data : data.toString("utf8")
  if (text === "") return { text: "", totalLines: 0, truncated: false }

  const lines = text.split("\n")
  // Drop the trailing empty line a final \n produces, so "3 lines\n" reads as 3.
  if (lines.at(-1) === "") lines.pop()

  if (lines.length <= head + tail) {
    return { text: lines.join("\n"), totalLines: lines.length, truncated: false }
  }

  const headSlice = lines.slice(0, head)
  const tailSlice = lines.slice(lines.length - tail)
  const elided = lines.length - head - tail
  const logPath = typeof opts.logPath === "function" ? opts.logPath() : opts.logPath
  const marker = logPath
    ? `[ … ${elided} lines elided — full output: ${logPath} ]`
    : `[ … ${elided} lines elided ]`

  return {
    logPath,
    text: [...headSlice, marker, ...tailSlice].join("\n"),
    totalLines: lines.length,
    truncated: true,
  }
}
