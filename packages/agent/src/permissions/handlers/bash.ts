import type { Segment } from "../../utils/bash/parser.ts"
import type { CheckResult, PermissionHandler, Rule, Suggestion, Verdict } from "../types.ts"

import { parseBash } from "../../utils/bash/parser.ts"
import { TOOLS } from "../../utils/bash/tools.ts"

/**
 * Handler for `Rule<"bash">` — evaluates a bash command line against
 * pattern rules, then delegates each segment's inferred and explicit
 * file paths to the file handler via `ctx.validate("read"|"write", …)`.
 *
 * Composition keeps file-rule logic in one place: the bash handler
 * doesn't know about workspaces, sensitive files, or path-pattern
 * matching — it just asks the registered handler for those scopes.
 *
 * Sources of file paths per segment:
 *   - `seg.reads` / `seg.writes` — explicit `<` / `>` / `>>` redirects
 *     extracted by the parser.
 *   - `TOOLS[cmd].reads/writes(args)` — inferred from built-in tool
 *     specs (e.g. `cat foo.txt` reads `foo.txt`, `tee out` writes `out`).
 *
 * Suggestions and reasons from inner `validate` calls bubble up so the
 * prompt UI can offer "allow `Bash(cat:*)`" alongside "add ~/Documents
 * as workspace" in a single ask.
 */
export const bashHandler: PermissionHandler<"bash"> = {
  validate(input, ctx): CheckResult {
    const parsed = parseBash(input)
    if (!parsed.ok) {
      return {
        ask: `Allow this bash command? (${parsed.reason})`,
        reason: parsed.reason,
        verdict: "ask",
      }
    }

    let verdict: Verdict = "allow"
    let reason: string | undefined
    const suggestions: Suggestion[] = []

    for (const seg of parsed.segments) {
      // Bash rule match for the command itself. Resolve this before the
      // conservative safety checks so explicit allow-all presets like yolo can
      // mean exactly that instead of degrading to an unimplemented ask prompt.
      const cmdVerdict = resolveRules(ctx.rules, seg) ?? "ask"
      if (seg.hasCommandSubst && cmdVerdict !== "allow") {
        return {
          ask: `Allow command substitution in \`${seg.cmd}\`?`,
          reason: "command substitution not allowed",
          verdict: "ask",
        }
      }
      const spec = TOOLS[seg.cmd]
      if (spec?.unsafe?.(seg.args) && cmdVerdict !== "allow") {
        return {
          ask: `Allow invocation of \`${seg.cmd}\`? (unsafe)`,
          reason: `${seg.cmd}: invocation mode not safely modelled`,
          verdict: "ask",
        }
      }

      let segVerdict: Verdict = cmdVerdict
      let segReason: string | undefined =
        cmdVerdict === "allow" ? undefined : `segment "${seg.cmd}" → ${cmdVerdict}`
      if (cmdVerdict === "ask") {
        suggestions.push({
          kind: "rule",
          pattern: seg.args.length > 0 ? `${seg.cmd}:*` : seg.cmd,
          scope: "bash",
        })
      }

      // Delegate file paths to the file handler. Reads first, then
      // writes; both contribute to this segment's verdict via combine.
      const reads = [...(spec?.reads?.(seg.args) ?? []), ...seg.reads]
      const writes = [...(spec?.writes?.(seg.args) ?? []), ...seg.writes.map((w) => w.path)]

      for (const path of reads) {
        if (seg.dyn?.has(path)) {
          segVerdict = combine(segVerdict, "ask")
          segReason ??= `${seg.cmd}: read ${path}: dynamic path`
          suggestions.push({
            kind: "rule",
            pattern: `${seg.cmd}:*`,
            scope: "bash",
          })
          continue
        }
        const r = ctx.validate("read", path)
        segVerdict = combine(segVerdict, r.verdict)
        if (r.verdict !== "allow") {
          segReason ??= `${seg.cmd}: read ${path}: ${r.reason}`
          if (r.suggestions) suggestions.push(...r.suggestions)
        }
        if (segVerdict === "deny") break
      }
      if (segVerdict !== "deny") {
        for (const path of writes) {
          if (seg.dyn?.has(path)) {
            segVerdict = combine(segVerdict, "ask")
            segReason ??= `${seg.cmd}: write ${path}: dynamic path`
            suggestions.push({
              kind: "rule",
              pattern: `${seg.cmd}:*`,
              scope: "bash",
            })
            continue
          }
          const w = ctx.validate("write", path)
          segVerdict = combine(segVerdict, w.verdict)
          if (w.verdict !== "allow") {
            segReason ??= `${seg.cmd}: write ${path}: ${w.reason}`
            if (w.suggestions) suggestions.push(...w.suggestions)
          }
          if (segVerdict === "deny") break
        }
      }

      verdict = combine(verdict, segVerdict)
      if (verdict !== "allow" && reason === undefined) reason = segReason
      if (verdict === "deny") break
    }

    return verdict === "allow"
      ? { verdict: "allow" }
      : {
          ask: `Allow this bash command?`,
          reason: reason ?? "no rule matched",
          suggestions: suggestions.length > 0 ? suggestions : undefined,
          verdict,
        }
  },
}

// ── Pattern matching ─────────────────────────────────────────────────────

/** A command-pattern rule.
 *
 *  Pattern syntax:
 *    "cmd"             → cmd alone, no args
 *    "cmd:*"           → cmd with any args (trailing wildcard)
 *    "cmd a"           → cmd with arg "a", no other args
 *    "cmd a:*"         → cmd with arg "a" plus any others
 *    "cmd a b"         → cmd with exact args [a, b]
 *    "cmd --flag*"     → cmd with arg starting with "--flag" (per-arg prefix)
 *    "bun test:node:*" → cmd "bun", arg "test:node", any others
 *
 *  Whitespace separates the cmd from its args, and args from each
 *  other. The `:` character is only meaningful as the trailing `:*`
 *  wildcard suffix — anywhere else (including inside an arg like
 *  `test:node`) it's a literal character. */

interface ParsedPattern {
  cmd: string
  /** Arg-position match tokens. Each may end with `*` for prefix match. */
  parts: string[]
  /** Set when the pattern ends with `:*`, allowing arbitrary further args. */
  trailingWildcard: boolean
}

/** Combine two verdicts: deny dominates, ask beats allow. */
function combine(a: Verdict, b: Verdict): Verdict {
  if (a === "deny" || b === "deny") return "deny"
  if (a === "ask" || b === "ask") return "ask"
  return "allow"
}

const patternCache = new Map<string, ParsedPattern>()

function parsePattern(pattern: string): ParsedPattern {
  const cached = patternCache.get(pattern)
  if (cached) return cached

  let body = pattern.trim()
  let trailingWildcard = false
  if (body.endsWith(":*")) {
    trailingWildcard = true
    body = body.slice(0, -2)
  }

  const tokens = body.split(/\s+/).filter((s) => s.length > 0)
  const cmd = tokens[0] ?? ""
  const result: ParsedPattern = {
    cmd,
    parts: tokens.slice(1),
    trailingWildcard,
  }
  patternCache.set(pattern, result)
  return result
}

function matchPart(part: string, value: string): boolean {
  if (part.endsWith("*")) {
    return value.startsWith(part.slice(0, -1))
  }
  return part === value
}

/** Test whether a parsed segment matches a rule pattern. */
export function matchRule(rule: Rule, seg: Segment): boolean {
  const p = parsePattern(rule.pattern)
  // Bare `*` (e.g. from a `Bash` rule with no parens) matches any command.
  if (p.cmd === "*" && p.parts.length === 0) return true
  if (p.cmd !== seg.cmd) return false
  if (seg.args.length < p.parts.length) return false
  for (let i = 0; i < p.parts.length; i++) {
    if (!matchPart(p.parts[i], seg.args[i])) return false
  }
  if (p.trailingWildcard) return true
  return seg.args.length === p.parts.length
}

/** First-match-wins resolution. Returns `undefined` if no rule matches. */
function resolveRules(rules: readonly Rule[], seg: Segment): Verdict | undefined {
  for (const r of rules) {
    if (matchRule(r, seg)) return r.policy
  }
  return undefined
}
