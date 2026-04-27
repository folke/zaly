import type { CheckResult, PermissionHandler, Rule, Verdict } from "../types.ts"

import { normPath } from "@zaly/shared"
import ignore from "ignore"
import { dirname, isAbsolute, relative } from "pathe"

/**
 * Handler for `Rule<"read" | "write">` — one impl serves both scopes
 * because they share the same matcher and the same workspace state.
 *
 * Algorithm:
 *   1. Normalize candidate to an absolute path.
 *   2. Sensitive-file check (env, ssh keys, credentials) → deny.
 *   3. Find the longest-prefix workspace containing the path. None →
 *      ask, with a `kind: "workspace"` suggestion for the containing
 *      directory.
 *   4. Inside a workspace: split rules by policy into three gitignore-
 *      style matchers (allow / deny / ask), test the workspace-relative
 *      path. Precedence: deny > ask > allow > default.
 *   5. Default when no rule matches but the path is inside a workspace:
 *      `allow` for reads (workspace = trust signal), `ask` for writes
 *      (mutating ops escalate by default; users add `Write(...)` rules
 *      to whitelist).
 *
 * Pattern grammar (per Claude-Code conventions):
 *   //abs/path          absolute filesystem path
 *   ~/path              path under home directory
 *   /path or path       workspace-relative (passed through to gitignore)
 */
export const fileHandler: PermissionHandler<"read" | "write"> = {
  validate(input, ctx): CheckResult {
    const abs = normPath(ctx.cwd, input)

    if (isSensitiveFile(abs)) {
      return { reason: `${abs}: sensitive file`, verdict: "deny" }
    }

    const ws = longestWorkspace(abs, ctx.workspaces)
    if (ws === undefined) {
      const parent = dirname(abs)
      return {
        reason: `${abs}: outside any workspace`,
        suggestions: [
          { description: `add ${parent} as workspace`, kind: "workspace", path: parent },
        ],
        verdict: "ask",
      }
    }

    const rel = relative(ws, abs)
    // Path is the workspace root itself (e.g. `find .` resolved to cwd).
    // No file to match against rules — workspace containment alone is
    // enough to allow it.
    if (rel === "") return { verdict: "allow" }

    const { allow, ask, deny } = compileMatchers(ws, ctx.rules)
    if (deny.ignores(rel)) return { reason: `${abs}: denied by rule`, verdict: "deny" }
    if (ask.ignores(rel)) return { reason: `${abs}: rule requires confirmation`, verdict: "ask" }
    if (allow.ignores(rel)) return { verdict: "allow" }

    // No rule matched. Inside-workspace default depends on scope:
    // reads ride on workspace trust; writes escalate.
    if (ctx.scope === "read") return { verdict: "allow" }
    return {
      reason: `${abs}: write requires confirmation`,
      suggestions: [{ kind: "rule", pattern: `/${rel}`, scope: "write" }],
      verdict: "ask",
    }
  },
}

/** True if `path` looks like a credentials/keys file we shouldn't
 *  expose to the model by default. Conservative — false positives are
 *  fine here, and users can override via `allow` rules. */
export function isSensitiveFile(path: string): boolean {
  return SENSITIVE_PATTERNS.some((re) => re.test(path))
}

/** Common locations for credentials, keys, and other sensitive data.
 *  Matched against the path string directly — covers both absolute and
 *  relative inputs. Add to this list as new gotchas surface. */
const SENSITIVE_PATTERNS: RegExp[] = [
  /(?:^|\/)\.env(?:\.|$)/, // .env, .env.local, .env.production, ...
  /(?:^|\/)\.git\/(?!hooks\/)/, // .git/* but not hooks (commonly inspected)
  /(?:^|\/)\.ssh\//, // ssh keys + config
  /(?:^|\/)\.aws\/credentials/,
  /(?:^|\/)\.netrc$/,
  /(?:^|\/)id_(?:rsa|dsa|ed25519|ecdsa)(?:\.pub)?$/,
  /(?:^|\/)\.npmrc$/, // can hold auth tokens
  /(?:^|\/)\.pypirc$/,
  /(?:^|\/)secrets?\//,
  /(?:^|\/)credentials?(?:\.|\/)/,
]

/** Longest-prefix match against the workspace list — returns the
 *  containing workspace's absolute path, or undefined if none contain
 *  the candidate. Workspaces arrive pre-normalized from the manager. */
function longestWorkspace(abs: string, workspaces: readonly string[]): string | undefined {
  let best: string | undefined
  for (const root of workspaces) {
    if (abs === root || abs.startsWith(root.endsWith("/") ? root : `${root}/`)) {
      if (best === undefined || root.length > best.length) best = root
    }
  }
  return best
}

/** Split rules by policy and feed each into its own gitignore matcher.
 *  Patterns get normalized (`//abs`, `~/`, `/rel`, `rel`) into
 *  workspace-rooted gitignore syntax; patterns that resolve outside the
 *  candidate's workspace are dropped (they don't apply here). */
function compileMatchers(workspace: string, rules: readonly Rule<"read" | "write">[]) {
  const allow = ignore()
  const deny = ignore()
  const ask = ignore()
  for (const rule of rules) {
    const norm = normalizePattern(rule.pattern, workspace)
    if (norm === undefined) continue
    const target: Record<Verdict, ReturnType<typeof ignore>> = { allow, ask, deny }
    target[rule.policy].add(norm)
  }
  return { allow, ask, deny }
}

function normalizePattern(pattern: string, workspace: string): string | undefined {
  if (pattern.startsWith("//")) {
    return relativizeToWorkspace(pattern.slice(1), workspace)
  }
  if (pattern.startsWith("~/")) {
    return relativizeToWorkspace(normPath(pattern), workspace)
  }
  // /pattern or pattern → already workspace-relative gitignore syntax.
  return pattern
}

function relativizeToWorkspace(absPattern: string, workspace: string): string | undefined {
  const rel = relative(workspace, absPattern)
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) return undefined
  return `/${rel}`
}
