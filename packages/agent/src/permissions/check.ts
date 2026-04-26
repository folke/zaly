import type { ParseResult, Segment } from "./parser.ts"
import type { PermissionPolicy } from "./policy.ts"
import type { Verdict } from "./rules.ts"

import { isAbsolute } from "node:path"
import { parseBash } from "./parser.ts"
import { combine } from "./rules.ts"
import { TOOLS } from "./tools.ts"

/** Commands that change the shell's working directory. When any of
 *  these appear in a chain, file-rule resolution against `process.cwd()`
 *  is unreliable for relative paths in subsequent segments — they
 *  resolve against the new cwd, which we can't statically know. */
const CWD_CHANGERS = new Set(["cd", "pushd", "popd"])

/** Result of evaluating a bash command: a verdict plus the parsed
 *  structure for downstream UI / logging. */
export interface CheckResult {
  verdict: Verdict
  /** Parse outcome — `ok: false` for inputs we couldn't structure
   *  (heredocs, malformed quoting, etc.); the parser itself returns
   *  `ok: true` even with `hasCommandSubst`, which surfaces as `ask`
   *  via the policy step. */
  parsed: ParseResult
  /** Per-segment verdicts when `parsed.ok` is true. Aligned 1:1 with
   *  `parsed.segments`. */
  segments?: Verdict[]
  /** First segment whose verdict isn't `allow`, surfaced for UI and
   *  rule-tuning ("which command needed approval?"). Undefined when
   *  the overall verdict is `allow` or the input failed to parse. */
  blocker?: Segment
  /** Human-readable reason when the verdict is `ask` or `deny` —
   *  surfaces "subshell not allowed", "no rule matched", etc. */
  reason?: string
}

/** Evaluate a bash command against a policy. Default-deny on parse
 *  failure: anything we can't structurally reason about goes to "ask"
 *  rather than silently passing.
 *
 *  When a `cd`/`pushd`/`popd` segment appears anywhere in the chain,
 *  the effective policy forces ask for any relative file path — we
 *  can't reason about which directory those resolve against once the
 *  cwd has shifted. Absolute paths are unaffected. */
export function checkBash(input: string, policy: PermissionPolicy): CheckResult {
  const parsed = parseBash(input)
  if (!parsed.ok) {
    return { parsed, reason: parsed.reason, verdict: "ask" }
  }

  const cwdChanged = parsed.segments.some((s) => CWD_CHANGERS.has(s.cmd))
  const effective = cwdChanged ? withRelativePathsAsked(policy) : policy

  const verdicts = parsed.segments.map((seg) => checkSegment(seg, effective))
  let verdict: Verdict = "allow"
  let blocker: Segment | undefined
  for (let i = 0; i < verdicts.length; i++) {
    verdict = combine(verdict, verdicts[i])
    if (verdict !== "allow" && blocker === undefined) blocker = parsed.segments[i]
  }
  return { blocker, parsed, segments: verdicts, verdict }
}

/** Wrap a policy so relative file paths force ask. Used when the
 *  command chain contains a cwd-changing segment. */
function withRelativePathsAsked(policy: PermissionPolicy): PermissionPolicy {
  return policy.extend({
    fileRead: (path) => (isAbsolute(path) ? policy.fileRead(path) : "ask"),
    fileWrite: (path) => (isAbsolute(path) ? policy.fileWrite(path) : "ask"),
  })
}

/** Evaluate one segment. Order:
 *    1. Bail to ask on hasCommandSubst.
 *    2. Built-in `unsafe` flags force ask.
 *    3. Command policy.
 *    4. fileRead for built-in-inferred reads + explicit `<` redirects.
 *    5. fileWrite for built-in-inferred writes + explicit `>` / `>>`. */
function checkSegment(seg: Segment, policy: PermissionPolicy): Verdict {
  if (seg.hasCommandSubst) return "ask"

  const spec = TOOLS[seg.cmd]
  if (spec?.unsafe?.(seg.args)) return "ask"

  let verdict = policy.command(seg)
  if (verdict === "deny") return "deny"

  const reads = [...(spec?.reads?.(seg.args) ?? []), ...seg.reads]
  for (const path of reads) {
    verdict = combine(verdict, policy.fileRead(path))
    if (verdict === "deny") return "deny"
  }

  const writes = [...(spec?.writes?.(seg.args) ?? []), ...seg.writes.map((w) => w.path)]
  for (const path of writes) {
    verdict = combine(verdict, policy.fileWrite(path))
    if (verdict === "deny") return "deny"
  }

  return verdict
}
