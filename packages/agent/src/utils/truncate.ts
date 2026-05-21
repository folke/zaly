const MAX_CHARS = 50_000
const MAX_LINES = 2000
const MAX_LINE_CHARS = 1000

export type TruncateOps = {
  strategy?: "head" | "tail" | "head+tail"
  /** Max chars to keep (default: 50k). */
  maxChars?: number
  /** Max lines to keep (default: 2000). */
  maxLines?: number
  /** Max chars per line (default: 1000). */
  maxLineChars?: number
  /** When `strategy` is "head+tail", how many lines to keep in the head.
   * When < 1, treated as a fraction of `maxLines`. Default: maxLines/2. */
  head?: number
}

export type TruncateResult = {
  text: string
  truncated: boolean
  truncatedLines?: boolean
  truncatedChars?: boolean
  truncatedLineChars?: boolean
  opts: Required<TruncateOps>
  origLines: number
  origChars: number
  origLongestLine: number
  origBytes: number
}

const isJsonish = (lines: string[]) => lines.length === 1 && /^[\s]*[[{]/.test(lines[0])

function truncateOpts(opts: TruncateOps = {}): Required<TruncateOps> {
  const maxLines = Math.max(1, opts.maxLines ?? MAX_LINES)
  let head = opts.head ?? Math.floor(maxLines / 2)
  if (head < 1) head = Math.floor(maxLines * head)
  head = Math.max(0, Math.min(head, maxLines))
  return {
    ...opts,
    head,
    maxChars: Math.max(1, opts.maxChars ?? MAX_CHARS),
    maxLineChars: Math.max(1, opts.maxLineChars ?? MAX_LINE_CHARS),
    maxLines,
    strategy: opts.strategy ?? "head+tail",
  }
}

export function truncate(data: string | Buffer, opts: TruncateOps = {}) {
  const text = typeof data === "string" ? data : data.toString("utf8")
  const o = truncateOpts(opts)

  let lines = text.split("\n")
  while (lines.at(-1) === "") lines.pop()
  const bytes = typeof data === "string" ? Buffer.byteLength(data, "utf8") : data.length

  const ret: TruncateResult = {
    opts: o,
    origBytes: bytes,
    origChars: text.length,
    origLines: lines.length,
    origLongestLine: lines.reduce((max, l) => Math.max(max, l.length), 0),
    text,
    truncated: false,
  }

  if (lines.length === 0) return ret

  const jsonish = isJsonish(lines)
  const truncLineChars = !jsonish && ret.origLongestLine > o.maxLineChars

  if (lines.length <= o.maxLines && ret.origChars <= o.maxChars && !truncLineChars) return ret

  ret.truncated = true

  if (jsonish && ret.origChars > o.maxChars) {
    const marker = ` … [truncated ${ret.origChars - o.maxChars} chars]`
    ret.text = lines[0].slice(0, Math.max(0, o.maxChars - marker.length))
    ret.text += marker
    ret.truncatedChars = true
    return ret
  }

  if (truncLineChars) {
    lines = lines.map((l) => {
      if (l.length <= o.maxLineChars) return l
      ret.truncatedLineChars = true
      const trunc = l.length - o.maxLineChars
      return `${l.slice(0, o.maxLineChars)} … [truncated ${trunc} chars]`
    })
  }

  const truncateLines = (ll: string[], maxLines: number, maxChars: number, reverse = false) => {
    ll = reverse ? ll.toReversed() : ll
    if (ll.length > maxLines) {
      ret.truncatedLines = true
      ll = ll.slice(0, maxLines)
    }
    let c = 0
    ll = ll.filter((l) => {
      c += l.length + 1 // +1 for the dropped \n
      if (c <= maxChars) return true
      ret.truncatedChars = true
      ret.truncatedLines = true
      return false
    })
    return reverse ? ll.toReversed() : ll
  }

  let strategy: "head" | "tail" | "head+tail" = o.strategy
  if (strategy === "head+tail") {
    if (o.head === 0) strategy = "tail"
    else if (o.head >= o.maxLines) strategy = "head"
  }

  if (strategy === "head") {
    lines = truncateLines(lines, o.maxLines, o.maxChars)
    const truncated = ret.origLines - lines.length
    if (truncated) lines.push(`… [truncated ${truncated} lines]`)
  } else if (strategy === "tail") {
    lines = truncateLines(lines, o.maxLines, o.maxChars, true)
    const truncated = ret.origLines - lines.length
    if (truncated) lines.unshift(`… [truncated ${truncated} lines]`)
  } else {
    const headMaxChars = Math.floor((o.head / o.maxLines) * o.maxChars)
    const tailMaxChars = o.maxChars - headMaxChars
    const headLines = lines.splice(0, o.head)
    const head = truncateLines(headLines, o.head, headMaxChars)
    const tail = truncateLines(lines, o.maxLines - o.head, tailMaxChars, true)
    const truncated = ret.origLines - head.length - tail.length
    lines = truncated ? [...head, `… [truncated ${truncated} lines]`, ...tail] : [...head, ...tail]
  }

  ret.text = lines.join("\n")
  return ret
}
