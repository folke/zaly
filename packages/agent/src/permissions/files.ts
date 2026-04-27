import type { Verdict } from "./bash/rules.ts"

import { isAbsolute, relative, resolve } from "node:path"
import { combine } from "./bash/rules.ts"

/** True if `path` is at or below `root` after path resolution. Handles
 *  relative paths by resolving against cwd. Defends against `..`
 *  escapes (`/foo/../bar` resolves before comparison). */
export function inRoot(root: string, path: string): boolean {
  const absRoot = resolve(root)
  const absPath = isAbsolute(path) ? resolve(path) : resolve(process.cwd(), path)
  if (absPath === absRoot) return true
  const rel = relative(absRoot, absPath)
  return rel.length > 0 && !rel.startsWith("..") && !isAbsolute(rel)
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

/** True if `path` looks like a credentials/keys file we shouldn't
 *  expose to the model by default. Conservative — false positives are
 *  fine here, and users can override via custom rules. */
export function isSensitiveFile(path: string): boolean {
  return SENSITIVE_PATTERNS.some((re) => re.test(path))
}

// ── Rule factories ───────────────────────────────────────────────────────
//
// Each factory returns a `(path: string) => Verdict` function that
// callers compose via `combineFileRules` (or wire individually into
// `defaultPolicy({ fileRead, fileWrite })`).

/** Allow paths within `roots`; everything else returns `undefined` (so
 *  the next rule in a chain decides). Pass cwd, project root, or any
 *  set of approved directories. */
export function allowWithin(...roots: string[]): (path: string) => Verdict | undefined {
  return (path) => (roots.some((r) => inRoot(r, path)) ? "allow" : undefined)
}

/** Deny paths matching `isSensitiveFile`. Use first in a chain so a
 *  later `allowWithin` can't whitelist a sensitive file. */
export function denySensitive(): (path: string) => Verdict | undefined {
  return (path) => (isSensitiveFile(path) ? "deny" : undefined)
}

/** Force ask for paths matching the given test. Useful for "treat
 *  anything outside cwd as ask" patterns. */
export function askIf(test: (path: string) => boolean): (path: string) => Verdict | undefined {
  return (path) => (test(path) ? "ask" : undefined)
}

/** Compose a file-rule chain. Each rule returns a Verdict (final) or
 *  undefined (defer to next). The final fallback applies if every rule
 *  defers. First-match-wins, then `combine`'d if multiple match — so
 *  putting `denySensitive()` first guarantees deny dominates. */
export function combineFileRules(
  rules: ((path: string) => Verdict | undefined)[],
  fallback: Verdict
): (path: string) => Verdict {
  return (path) => {
    let outcome: Verdict | undefined
    for (const rule of rules) {
      const v = rule(path)
      if (v === undefined) continue
      outcome = outcome === undefined ? v : combine(outcome, v)
      if (outcome === "deny") return "deny"
    }
    return outcome ?? fallback
  }
}
