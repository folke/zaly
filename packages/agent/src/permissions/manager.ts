import type { PermissionPresetName } from "./presets.ts"
import type { CheckResult, Rule, Verdict } from "./types.ts"

import { normPath } from "@zaly/shared"
import { handlerRegistry } from "./handlers/registry.ts"
import { permissionPresets } from "./presets.ts"

export type PermissionOptions = {
  /** Session cwd — anchor for resolving relative paths and the default
   *  spawn cwd for bash subprocesses. Pinned at construction; the agent
   *  never mutates `process.cwd()`, and there's no `cd` tool. Defaults
   *  to `process.cwd()`. */
  cwd?: string
  /** Named preset — supplies a baseline rule set. Explicit `rules` win
   *  over preset rules on conflict (first-match-wins resolution; user
   *  rules are listed before preset rules at construction). */
  preset?: PermissionPresetName
  rules?: Rule[] | Partial<Record<Verdict, string[]>>
  /** Initial workspace list. `cwd` is auto-added so the user doesn't
   *  have to repeat it. Pass paths absolute (or relative — they'll be
   *  resolved against `cwd`). */
  workspaces?: readonly string[]
}

/**
 * Owns per-session permission state and dispatches `validate(scope, input)`
 * to the registered handler for `scope`. Handlers receive rules
 * pre-filtered to their scope plus the shared workspace list.
 *
 * Mutators (`addWorkspace`, `addRule`, …) are how the prompt UI promotes
 * an `ask` verdict — once the user picks "allow `Bash(git push:*)` for
 * this session", the TUI calls `manager.addRule(...)` and subsequent
 * `validate()` calls pick it up via the filter.
 */
export class PermissionManager {
  readonly cwd: string
  #rules: Rule[] = []
  #workspaces: string[]

  constructor(opts?: PermissionOptions) {
    this.cwd = normPath(opts?.cwd)
    if (opts?.rules) {
      const more = Array.isArray(opts.rules) ? opts.rules : parseRules(opts.rules)
      this.#rules.push(...more)
    }
    if (opts?.preset) this.#rules.push(...parseRules(permissionPresets[opts.preset].rules))
    this.#workspaces = (opts?.workspaces ?? []).map((p) => normPath(this.cwd, p))
    // Auto-include cwd so users don't have to repeat it. Listed first so
    // longest-prefix lookup in handlers stays predictable.
    if (!this.#workspaces.includes(this.cwd)) this.#workspaces.unshift(this.cwd)
  }

  /** Pass-through to the module-scoped handler registry. */
  register = handlerRegistry.register.bind(handlerRegistry)

  // ── Workspaces ──────────────────────────────────────────────────────

  get workspaces(): readonly string[] {
    return this.#workspaces
  }

  addWorkspace(path: string): void {
    const abs = normPath(this.cwd, path)
    if (!this.#workspaces.includes(abs)) this.#workspaces.push(abs)
  }

  removeWorkspace(path: string): void {
    const abs = normPath(this.cwd, path)
    const i = this.#workspaces.indexOf(abs)
    if (i !== -1) this.#workspaces.splice(i, 1)
  }

  // ── Rules ───────────────────────────────────────────────────────────

  get rules(): readonly Rule[] {
    return this.#rules
  }

  /** Rules whose scope has no registered handler — surfaces config
   *  errors (typos, unknown scopes, malformed pattern strings). The TUI
   *  can render these as a startup warning. */
  get invalidRules(): readonly Rule[] {
    return this.#rules.filter((r) => !handlerRegistry.has(r.scope))
  }

  addRule(rule: Rule): void {
    this.#rules.push(rule)
  }

  // ── Dispatch ────────────────────────────────────────────────────────

  validate(scope: string, input: string): CheckResult {
    if (!handlerRegistry.has(scope)) {
      throw new Error(`no permission handler registered for scope "${scope}"`)
    }
    const handler = handlerRegistry.load(scope)
    const rules = this.#rules.filter((r) => r.scope === scope)
    return handler.validate(input, {
      cwd: this.cwd,
      rules,
      scope,
      validate: this.validate.bind(this),
      workspaces: this.#workspaces,
    })
  }
}

/** Parse Claude-Code-style permission config (a verdict-keyed map of
 *  pattern strings) into structured `Rule<string>[]`.
 *
 *  Pattern shapes accepted:
 *    "Bash(ls:*)"   → { scope: "bash", pattern: "ls:*" }
 *    "WebSearch"    → { scope: "websearch", pattern: "*" }   // bare name = scope-wide
 *
 *  Scopes are normalized to lower-case so config can use either
 *  TitleCase ("Bash") or lowercase ("bash") interchangeably.
 *
 *  Malformed entries are pushed verbatim so `manager.invalidRules`
 *  surfaces them — typos in the scope ("Bahs(...)") are caught the same
 *  way (no handler registered → flagged invalid). */
export function parseRules(rules: Partial<Record<Verdict, string[]>>): Rule[] {
  const ret: Rule[] = []
  for (const [policy, patterns] of Object.entries(rules)) {
    for (const raw of patterns) {
      const m = raw.match(/^(\w+)(?:\((.+)\))?$/)
      if (m) {
        const [, scope, pat = "*"] = m
        ret.push({ pattern: pat, policy: policy as Verdict, scope: scope.toLowerCase() })
      } else {
        // Truly malformed — preserve verbatim so invalidRules surfaces it.
        ret.push({ pattern: raw, policy: policy as Verdict, scope: "invalid" })
      }
    }
  }
  return ret
}
