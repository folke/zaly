import type { CheckResult, PermissionHandler, Suggestion, Verdict } from "../../types.ts"

import { parseBash } from "./parser.ts"
import { combine, resolveRules } from "./rules.ts"
import { TOOLS } from "./tools.ts"

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
      return { reason: parsed.reason, verdict: "ask" }
    }

    let verdict: Verdict = "allow"
    let reason: string | undefined
    const suggestions: Suggestion[] = []

    for (const seg of parsed.segments) {
      if (seg.hasCommandSubst) {
        return { reason: "command substitution not allowed", verdict: "ask" }
      }
      const spec = TOOLS[seg.cmd]
      if (spec?.unsafe?.(seg.args)) {
        return { reason: `${seg.cmd}: invocation mode not safely modelled`, verdict: "ask" }
      }

      // Bash rule match for the command itself.
      const cmdVerdict = resolveRules(ctx.rules, seg) ?? "ask"
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
          reason: reason ?? "no rule matched",
          suggestions: suggestions.length > 0 ? suggestions : undefined,
          verdict,
        }
  },
}
