/**
 * Core permission primitives.
 *
 * - `Rule<T>` is the policy unit — pattern + verdict, scoped to a kind
 *   of resource (`bash`, `read`, `write`, …).
 * - `PermissionHandler<T>` is the validator for one or more scopes; the
 *   manager dispatches `validate()` to the right handler.
 * - `PermissionContext<T>` is what the handler sees on each call:
 *   the matched `scope`, the rules pre-filtered to that scope, plus any
 *   shared data (e.g. workspace directories) that the manager exposes
 *   to all handlers.
 *
 * Scopes are open strings — built-ins are `bash | read | write | fetch`,
 * but plugins register their own. `PermissionHandler<"a" | "b">` lets
 * one impl handle multiple related scopes (e.g. `FileHandler` for both
 * `read` and `write`, sharing workspace state via the context).
 */
export type Verdict = "allow" | "deny" | "ask"

export type Rule<T extends string = string> = {
  scope: T
  pattern: string
  policy: Verdict
}

/** A handler-proposed action the user can promote (the matching pattern
 *  / containing path that *would* have allowed the input). The handler
 *  describes "what would have matched"; the UI picks the polarity
 *  ("allow once", "allow always", "deny always") and writes the rule
 *  back through the appropriate manager API.
 *
 *  - `kind: "rule"` → suggests adding a `Rule<scope>` with this pattern.
 *  - `kind: "workspace"` → suggests adding a workspace directory; only
 *     handlers operating over paths emit this.
 */
export type Suggestion =
  | { kind: "rule"; scope: string; pattern: string; description?: string }
  | { kind: "workspace"; path: string; description?: string }

export type CheckResult =
  | { verdict: "allow" }
  | {
      verdict: "deny"
      reason: string
      /** Optional hints for the prompt UI. Each suggestion describes a
       *  pattern/path that would have matched the input; the UI offers
       *  polarity buttons ("allow once" / "allow always" / "deny always")
       *  and applies the user's choice via the manager. */
      suggestions?: Suggestion[]
    }
  | {
      verdict: "ask"
      reason: string
      ask: string
      suggestions?: Suggestion[]
    }

export interface PermissionContext<T extends string> {
  /** The matched scope. Useful when a handler covers multiple scopes
   *  (e.g. `FileHandler` for `"read" | "write"`) and wants to branch. */
  scope: T
  /** Rules pre-filtered to `scope` by the manager. */
  rules: readonly Rule<T>[]
  /** Workspace directories shared across handlers — file scopes use
   *  these as containment roots; bash uses them for cwd-aware checks.
   *  All paths are absolute and pre-normalized. The session cwd is
   *  always included as the first entry. */
  workspaces: readonly string[]
  /** Session cwd — absolute, pinned at manager construction. Use this
   *  to resolve relative paths in `input`; never read `process.cwd()`
   *  directly from a handler. */
  cwd: string
  /** Re-enter the manager to validate a different scope. Used by
   *  composite handlers — e.g. the bash handler delegates `<` redirects
   *  and inferred file paths to `ctx.validate("read", path)` rather
   *  than carrying file-rule logic itself. */
  validate: (scope: string, input: string) => CheckResult
}

export interface PermissionHandler<T extends string> {
  // oxlint-disable-next-line typescript/method-signature-style
  validate(input: string, ctx: PermissionContext<T>): CheckResult
}
