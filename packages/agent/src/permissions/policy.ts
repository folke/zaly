import type { CheckResult } from "./bash/check.ts"
import type { Segment } from "./bash/parser.ts"
import type { Rule, Verdict } from "./bash/rules.ts"
import type { PermissionPresetName } from "./presets.ts"

import { checkBash } from "./bash/check.ts"
import { combine, resolveRules } from "./bash/rules.ts"
import { permissionPresets } from "./presets.ts"

export type PermissionOptions = {
  preset?: PermissionPresetName
  rules?: readonly Rule[]
  /** Verdict for any command not matched by `rules`. Default `ask`. */
  fallback?: Verdict
  /** Returns the verdict for a given file path. Default treats every
   *  path as `ask`. Replace with project-aware rules (e.g. allow within
   *  cwd, deny inside `.git/` or `.env*`). */
  fileRead?: (path: string) => Verdict
  fileWrite?: (path: string) => Verdict
}

type ResolvedPermissions = Required<Omit<PermissionOptions, "preset">> &
  Pick<PermissionOptions, "preset">

const defaults = {
  fallback: "ask",
  fileRead: () => "ask",
  fileWrite: () => "ask",
  rules: [],
} as const satisfies PermissionOptions

/** Pluggable policy hooks. The command rule lives alongside file
 *  read/write rules so all three axes share one decision surface and
 *  the file-side hooks can be reused by the file-read tool later. */
export class PermissionPolicy {
  #opts: ResolvedPermissions

  constructor(opts: ResolvedPermissions) {
    this.#opts = opts
  }

  get preset(): PermissionPresetName | undefined {
    return this.#opts.preset
  }

  /** Combine verdicts from multiple checks into one final verdict. */
  resolve(input: Verdict | CheckResult | (Verdict | CheckResult)[]): Verdict {
    const all = [input].flat().map((x) => (typeof x === "string" ? x : x.verdict))
    return all.reduce(combine, "allow")
  }

  bash(input: string): CheckResult {
    return checkBash(input, this)
  }

  /** Verdict for a structurally-valid command segment. Default impls
   *  match against `Rule[]` patterns; callers can supply richer logic. */
  command(seg: Segment): Verdict {
    return resolveRules(this.#opts.rules, seg) ?? this.#opts.fallback
  }

  /** Verdict for reading a path. Used both for `<` redirects in bash
   *  and for the file-read tool itself. */
  fileRead(path: string): Verdict {
    return this.#opts.fileRead(path)
  }

  /** Verdict for writing a path. Used both for `>` / `>>` redirects in
   *  bash and for any file-write tool. */
  fileWrite(path: string): Verdict {
    return this.#opts.fileWrite(path)
  }

  extend(opts: PermissionOptions): PermissionPolicy {
    return new PermissionPolicy({
      ...this.#opts,
      ...opts,
      rules: [...this.#opts.rules, ...(opts.rules ?? [])],
    })
  }
}

/** Convenience builder. Supplies sensible defaults so callers can
 *  evolve from "everything asks" to fine-grained rules incrementally. */
export function definePermissions(opts: PermissionOptions = {}): PermissionPolicy {
  const preset = opts.preset ? permissionPresets[opts.preset] : undefined
  return new PermissionPolicy({
    ...defaults,
    ...preset,
    ...opts,
    rules: [...(preset?.rules ?? []), ...(opts.rules ?? [])],
  })
}
