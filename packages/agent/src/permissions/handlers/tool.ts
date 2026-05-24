import type { CheckResult, PermissionHandler, Rule } from "../types.ts"

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
 * Resolution is first-match-wins. Default verdict when no rule matches is
 * `allow` — an unconfigured `tool` scope should not surprise users by
 * gating ordinary tool calls.
 */
export const toolHandler: PermissionHandler<"tool"> = {
  validate(input, ctx): CheckResult {
    const rule = resolveRule(input, ctx.rules)
    if (rule?.policy === "deny") {
      return { reason: `tool ${input}: denied by rule`, verdict: "deny" }
    }
    if (rule?.policy === "ask") {
      return {
        ask: `Allow tool ${input}?`,
        reason: `tool ${input}: rule requires confirmation`,
        suggestions: [{ kind: "rule", pattern: input, scope: "tool" }],
        verdict: "ask",
      }
    }
    return { verdict: "allow" }
  },
}

function resolveRule(input: string, rules: readonly Rule<"tool">[]): Rule<"tool"> | undefined {
  for (const rule of rules) {
    if (ignore().add(rule.pattern).ignores(input)) return rule
  }
}
