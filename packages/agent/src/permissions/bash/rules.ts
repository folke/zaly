import type { Segment } from "./parser.ts"

export type Verdict = "allow" | "deny" | "ask"

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
export interface Rule {
  pattern: string
  policy: Verdict
}

interface ParsedPattern {
  cmd: string
  /** Arg-position match tokens. Each may end with `*` for prefix match. */
  parts: string[]
  /** Set when the pattern ends with `:*`, allowing arbitrary further args. */
  trailingWildcard: boolean
}

/** Combine two verdicts: deny dominates, ask beats allow. */
export function combine(a: Verdict, b: Verdict): Verdict {
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
  if (p.cmd !== seg.cmd) return false
  if (seg.args.length < p.parts.length) return false
  for (let i = 0; i < p.parts.length; i++) {
    if (!matchPart(p.parts[i], seg.args[i])) return false
  }
  if (p.trailingWildcard) return true
  return seg.args.length === p.parts.length
}

/** First-match-wins resolution. Returns `undefined` if no rule matches. */
export function resolveRules(rules: readonly Rule[], seg: Segment): Verdict | undefined {
  for (const r of rules) {
    if (matchRule(r, seg)) return r.policy
  }
  return undefined
}
