import type { CheckResult, PermissionHandler, Rule, Verdict } from "../types.ts"

import ignore from "ignore"

/**
 * Generic tool-scope handler.
 *
 * Used by `Tasks` to gate every tool dispatch on the tool name, and
 * available to tools themselves for richer checks (e.g. fetch passing
 * `fetch:example.com` so users can ask-for-domain).
 *
 * Pattern grammar is gitignore-style — reuses the `ignore` package so
 * the syntax matches `read` / `write` patterns. Common shapes:
 *
 *   "tool"             → bare scope; matches every input  (default-allow)
 *   "tool(bash)"       → exact match for `"bash"`
 *   "tool(fetch:*)"    → glob match `"fetch:..."`
 *   "tool(task_*)"     → glob match `"task_..."`
 *
 * Precedence: deny > ask > allow > default. Default verdict when no
 * rule matches is `allow` — an unconfigured `tool` scope should not
 * surprise users by gating ordinary tool calls.
 */
export const toolHandler: PermissionHandler<"tool"> = {
  validate(input, ctx): CheckResult {
    const { allow, ask, deny } = compileMatchers(ctx.rules)

    if (deny.ignores(input)) {
      return { reason: `tool ${input}: denied by rule`, verdict: "deny" }
    }
    if (ask.ignores(input)) {
      return {
        reason: `tool ${input}: rule requires confirmation`,
        suggestions: [{ kind: "rule", pattern: input, scope: "tool" }],
        verdict: "ask",
      }
    }
    if (allow.ignores(input)) return { verdict: "allow" }

    // No rule matched → default allow. Lets the basic flow stay quiet
    // for users who haven't bothered to write tool rules.
    return { verdict: "allow" }
  },
}

function compileMatchers(rules: readonly Rule<"tool">[]) {
  const allow = ignore()
  const ask = ignore()
  const deny = ignore()
  for (const rule of rules) {
    const target: Record<Verdict, ReturnType<typeof ignore>> = { allow, ask, deny }
    target[rule.policy].add(rule.pattern)
  }
  return { allow, ask, deny }
}
