import { safeStringify } from "@zaly/shared"
import { parse as shellParse } from "shell-quote"

/** A shell command broken down into its structural parts. One bash
 *  input may parse to multiple segments (joined by `|`, `&&`, `||`, `;`).
 *  Each segment is evaluated independently by the policy. */
export interface Segment {
  cmd: string
  args: string[]
  /** File paths the segment reads from (`< file` redirects). Built-in
   *  tools may add inferred reads in the policy layer. */
  reads: string[]
  /** File paths the segment writes to (`> file` / `>> file`). */
  writes: { path: string; mode: "trunc" | "append" }[]
  /** True if the input contains command substitution (`$()` or backticks)
   *  or any other dynamic-evaluation construct. Forces ask. */
  hasCommandSubst: boolean
}

export type ParseResult =
  | { ok: true; segments: Segment[] }
  | { ok: false; reason: string }

/** Targets a redirect can write to without filesystem implications.
 *  Anything else is treated as a file write and goes through fileWrite
 *  policy. */
const SAFE_REDIRECT_TARGETS = new Set([
  "/dev/null",
  "/dev/stderr",
  "/dev/stdout",
])

/** A redirect target like `&1`, `&2`, `&-` — duplicates an existing fd,
 *  no filesystem effect. */
function isFdRedirect(target: string): boolean {
  return /^&(?:\d+|-)$/.test(target)
}

type Op = { op: string }
type Glob = { op: "glob"; pattern: string }
type Comment = { comment: string }
type Token = string | Op | Glob | Comment

const COMMAND_SEPS = new Set(["|", "&&", "||", ";"])
const REDIRECT_OPS = new Set([">", ">>", "<", ">&", "<&"])

/** Parse a bash command line. Returns segments with a flag for
 *  unsupported constructs that force "ask" downstream. Heredocs,
 *  subshells, command substitution, and backticks all surface as
 *  `hasCommandSubst: true` (the umbrella "we can't reason about this"
 *  signal) rather than parse failures, so the policy can still decide. */
export function parseBash(input: string): ParseResult {
  // Heredocs derail shell-quote (the body bleeds into surrounding tokens),
  // so we bail to ok:false here. checkBash maps that to ask.
  if (/<<-?\s*['"]?\w+/.test(input)) {
    return { ok: false, reason: "heredoc not supported" }
  }
  // Backticks command-substitute in bash unless inside single quotes
  // (single quotes preserve everything literally; double quotes don't
  // suppress substitution). Flag only the unquoted form so embedded
  // template literals in `bun -e '... ${x} `tpl` ...'` don't trip us.
  const hasBackticks = hasUnquotedBacktick(input)

  let rawTokens: Token[]
  try {
    rawTokens = shellParse(input) as Token[]
  } catch (error) {
    return { ok: false, reason: `tokenize: ${(error as Error).message}` }
  }

  // Inline plain `(subshell)` contents as separate segments; strip
  // `$(...)` regions and flag as command substitution. Backticks
  // already detected via the pre-scan above.
  const flat = flattenParens(rawTokens)
  const hasCommandSubst = hasBackticks || flat.hasCommandSubst

  const segmentTokens: Token[][] = [[]]
  for (const t of flat.tokens) {
    if (typeof t === "object" && "comment" in t) continue

    if (typeof t === "object" && "op" in t && COMMAND_SEPS.has(t.op)) {
      if (segmentTokens.at(-1)!.length > 0) segmentTokens.push([])
      continue
    }

    segmentTokens.at(-1)!.push(t)
  }

  if (segmentTokens.at(-1)!.length === 0) segmentTokens.pop()

  const segments: Segment[] = []
  for (const segToks of segmentTokens) {
    const seg = parseSegment(segToks)
    if (!seg.ok) return seg
    if (seg.segment) segments.push({ ...seg.segment, hasCommandSubst })
  }

  if (segments.length === 0) {
    return { ok: false, reason: "empty input" }
  }
  return { ok: true, segments }
}

function parseSegment(
  tokens: Token[]
):
  | { ok: true; segment: Omit<Segment, "hasCommandSubst"> | undefined }
  | { ok: false; reason: string } {
  const args: string[] = []
  const reads: string[] = []
  const writes: { path: string; mode: "trunc" | "append" }[] = []

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]

    if (typeof t === "string") {
      // FD prefix on a redirect (`2>&1`, `2>file`, `1<&-`) — shell-quote
      // splits the leading digit off as its own token. Don't treat it
      // as a regular arg; the redirect handler below picks up the op.
      if (/^\d+$/.test(t)) {
        const next = tokens[i + 1]
        if (typeof next === "object" && "op" in next && REDIRECT_OPS.has(next.op)) {
          continue
        }
      }
      args.push(t)
      continue
    }

    if ("comment" in t) continue

    if ("pattern" in t) {
      // Pass globs through as their pattern — policy layer decides.
      args.push(t.pattern)
      continue
    }

    if (!("op" in t)) {
      return { ok: false, reason: `unsupported token: ${safeStringify(t)}` }
    }

    if (REDIRECT_OPS.has(t.op)) {
      const next = tokens[i + 1]
      if (typeof next !== "string") {
        return { ok: false, reason: `redirect target missing after ${t.op}` }
      }
      i++ // consume target

      if (t.op === ">" || t.op === ">>") {
        // Skip safe targets (/dev/null etc.) and fd redirects entirely.
        if (SAFE_REDIRECT_TARGETS.has(next) || isFdRedirect(next)) continue
        writes.push({ mode: t.op === ">>" ? "append" : "trunc", path: next })
      } else if (t.op === "<") {
        if (SAFE_REDIRECT_TARGETS.has(next) || isFdRedirect(next)) continue
        reads.push(next)
      }
      // `>&` / `<&` are fd-duplicating (`2>&1`-style) — no fs impact.
      continue
    }

    return { ok: false, reason: `unsupported op: ${t.op}` }
  }

  // Strip leading wrapper commands (`time`, `nohup`, `nice`, …) so the
  // policy sees the real command being run. `time bun test` evaluates
  // as `bun test`; a bare `time` (or `time (subshell)` after flatten)
  // leaves nothing and signals the caller to drop the segment.
  const unwrapped = unwrapWrappers(args)
  if (unwrapped.length === 0) {
    return { ok: true, segment: undefined }
  }

  return {
    ok: true,
    segment: {
      args: unwrapped.slice(1),
      cmd: unwrapped[0],
      reads,
      writes,
    },
  }
}

interface WrapperSpec {
  /** Flags that consume the next arg as their value. */
  valueFlags?: Set<string>
}

/** Commands that wrap another command — they're transparent for
 *  permission purposes, since the security-relevant action is whatever
 *  they run. `sudo` is intentionally absent: it changes the effective
 *  user and must always be flagged. */
const WRAPPERS: Partial<Record<string, WrapperSpec>> = {
  command: {}, // bash builtin, bypasses aliases
  ionice: { valueFlags: new Set(["-c", "-n", "-p", "-P", "-u"]) },
  nice: { valueFlags: new Set(["-n", "--adjustment"]) },
  nohup: {},
  time: {}, // bash reserved word, also GNU /usr/bin/time
}

/** Detect backticks outside single-quoted regions. Single quotes in
 *  bash can't be escaped from within, so the toggle is a simple state
 *  flip on every `'`. Double quotes do not suppress backtick
 *  substitution and are ignored here. */
function hasUnquotedBacktick(input: string): boolean {
  let inSingle = false
  for (const c of input) {
    if (c === "'") {
      inSingle = !inSingle
      continue
    }
    if (c === "`" && !inSingle) return true
  }
  return false
}

/** Strip leading wrapper-command prefixes from an arg list. Repeats
 *  while the head is a wrapper (so `time nice -n 5 cmd` → `cmd`).
 *  Wrapper-flags (and their values, where applicable) are consumed
 *  along with the wrapper itself. */
function unwrapWrappers(args: string[]): string[] {
  let current = args
  while (current.length > 0) {
    const spec = WRAPPERS[current[0]]
    if (!spec) break
    const valueFlags = spec.valueFlags ?? new Set()
    let i = 1
    while (i < current.length && current[i].startsWith("-")) {
      const flag = current[i]
      i++
      if (valueFlags.has(flag) && i < current.length) i++ // consume flag value
    }
    current = current.slice(i)
  }
  return current
}

/** Walk a token list and resolve paren constructs:
 *  - Plain `(subshell)` → tokens inlined with `;` boundaries on each
 *    side, so the contents become independent segments evaluated by
 *    the same policy. The subshell's own scope (cwd changes etc.) is
 *    irrelevant to permissions — each command is checked individually.
 *  - `$(...)` (command substitution) → stripped entirely, with the
 *    `hasCommandSubst` flag raised. The dynamic value can't be
 *    statically reasoned about. Detected by the leading `$` token
 *    that shell-quote emits before the `(`.
 *
 *  Recurses into subshell contents to handle nesting and to catch
 *  `$(...)` constructs nested inside subshells. */
function flattenParens(tokens: Token[]): { tokens: Token[]; hasCommandSubst: boolean } {
  const out: Token[] = []
  let hasCommandSubst = false
  let i = 0
  while (i < tokens.length) {
    const t = tokens[i]
    if (typeof t === "object" && "op" in t && t.op === "(") {
      const isSubst = out.at(-1) === "$"
      if (isSubst) out.pop()

      // Find matching `)`, accounting for nesting.
      let depth = 1
      let j = i + 1
      while (j < tokens.length && depth > 0) {
        const tj = tokens[j]
        if (typeof tj === "object" && "op" in tj) {
          if (tj.op === "(") depth++
          else if (tj.op === ")") depth--
        }
        if (depth > 0) j++
      }
      const inner = tokens.slice(i + 1, j)

      if (isSubst) {
        hasCommandSubst = true
        // Drop the entire $(...) — its value is dynamic.
      } else {
        const sub = flattenParens(inner)
        if (sub.hasCommandSubst) hasCommandSubst = true
        // Surround with separators so subshell contents form their own
        // segments regardless of what's adjacent in the outer chain.
        out.push({ op: ";" }, ...sub.tokens, { op: ";" })
      }
      i = j + 1
      continue
    }

    if (typeof t === "object" && "op" in t && t.op === ")") {
      // Stray closing paren (unbalanced input). Skip — the parser's
      // overall result will likely fail downstream on a malformed segment.
      i++
      continue
    }

    out.push(t)
    i++
  }
  return { hasCommandSubst, tokens: out }
}
