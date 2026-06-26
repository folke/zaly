import type { CheckResult, PermissionHandler, Rule } from "../types.ts"

import { normPath, prettyPath } from "@zaly/shared"
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
 *   4. Inside a workspace: resolve the first matching rule against the
 *      workspace-relative path. Earlier rules win.
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
    const inWorkspace = ws !== undefined

    // Inside-workspace + path === root: the workspace itself (e.g. `find .`
    // resolved to cwd). Workspace containment alone is enough to allow.
    if (inWorkspace && abs === ws) return { verdict: "allow" }

    // Outside any workspace, fall through to rule matching with `/` as
    // synthetic root. Lets blanket rules like `read(*)` (yolo preset)
    // override the default "ask outside workspace" verdict, while
    // narrower presets keep the safer default.
    const base = ws ?? "/"
    const rel = relative(base, abs)

    const verb = ctx.scope === "read" ? "reading" : "writing"

    const rule = resolveRule(base, rel, ctx.rules)
    if (rule?.policy === "deny") return { reason: `${abs}: denied by rule`, verdict: "deny" }
    if (rule?.policy === "ask") {
      return {
        ask: `Allow ${verb} ${prettyPath(abs)}?`,
        reason: `${abs}: rule requires confirmation`,
        suggestions: [{ kind: "rule", pattern: `/${rel}`, scope: ctx.scope }],
        verdict: "ask",
      }
    }
    if (rule?.policy === "allow") return { verdict: "allow" }

    // No rule matched. Defaults differ by location:
    //   - Inside a workspace: reads ride on workspace trust → allow;
    //     writes escalate → ask.
    //   - Outside any workspace: always ask, and surface a
    //     workspace-add suggestion so the user can promote the parent
    //     dir without composing a rule by hand.
    if (!inWorkspace) {
      const parent = dirname(abs)
      return {
        ask: `Allow ${verb} ${prettyPath(abs)}? (not in any workspace)`,
        reason: `${abs}: outside any workspace`,
        suggestions: [
          { description: `add ${parent} as workspace`, kind: "workspace", path: parent },
        ],
        verdict: "ask",
      }
    }
    if (ctx.scope === "read") return { verdict: "allow" }
    return {
      ask: `Allow ${verb} ${prettyPath(abs)}?`,
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

/** Resolve the first matching rule.
 *  Patterns get normalized (`//abs`, `~/`, `/rel`, `rel`) into
 *  workspace-rooted gitignore syntax; patterns that resolve outside the
 *  candidate's workspace are dropped (they don't apply here). */
function resolveRule(
  workspace: string,
  rel: string,
  rules: readonly Rule<"read" | "write">[]
): Rule<"read" | "write"> | undefined {
  // FIXME: work-around for `path must not be empty`, but obvioulsy not correct
  // Can be triggered with something like `bash(a=/etc; b=hostname; cat "$a/$b")`
  if (rel === "") return undefined
  for (const rule of rules) {
    const norm = normalizePattern(rule.pattern, workspace)
    if (norm === undefined) continue
    try {
      if (ignore().add(norm).ignores(rel)) return rule
    } catch {}
  }
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
