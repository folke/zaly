import type { PermissionOptions } from "./policy.ts"
import type { Rule, Verdict } from "./rules.ts"

import { allowWithin, combineFileRules, denySensitive } from "./files.ts"

export type PermissionPresetName = "strict" | "readonly" | "permissive" | "yolo"

export interface PermissionPreset extends Required<PermissionOptions> {
  preset: PermissionPresetName
  description: string
}

// ── Rule sets ────────────────────────────────────────────────────────────

/** Read-only utilities the model can run without surprises: file
 *  inspection, search, and metadata. None of these modify state. */
const READONLY_TOOLS: Rule[] = [
  { pattern: "ls:*", policy: "allow" },
  { pattern: "cat:*", policy: "allow" },
  { pattern: "head:*", policy: "allow" },
  { pattern: "tail:*", policy: "allow" },
  { pattern: "wc:*", policy: "allow" },
  { pattern: "find:*", policy: "allow" },
  { pattern: "grep:*", policy: "allow" },
  { pattern: "rg:*", policy: "allow" },
  { pattern: "fd:*", policy: "allow" },
  { pattern: "sort:*", policy: "allow" },
  { pattern: "uniq:*", policy: "allow" },
  { pattern: "cut:*", policy: "allow" },
  { pattern: "diff:*", policy: "allow" },
  { pattern: "stat:*", policy: "allow" },
  { pattern: "file:*", policy: "allow" },
  { pattern: "realpath:*", policy: "allow" },
  { pattern: "readlink:*", policy: "allow" },
  { pattern: "basename:*", policy: "allow" },
  { pattern: "dirname:*", policy: "allow" },
  { pattern: "echo:*", policy: "allow" },
  { pattern: "printf:*", policy: "allow" },
  { pattern: "sed:*", policy: "allow" }, // file writes still gated by fileWrite
  { pattern: "awk:*", policy: "allow" },
  { pattern: "xxd:*", policy: "allow" },
  { pattern: "hexdump:*", policy: "allow" },
  { pattern: "od:*", policy: "allow" },
  { pattern: "tree:*", policy: "allow" },
  { pattern: "pwd", policy: "allow" },
  { pattern: "true", policy: "allow" },
  { pattern: "false", policy: "allow" },
  { pattern: "which:*", policy: "allow" },
  { pattern: "type:*", policy: "allow" },
  { pattern: "command:*", policy: "allow" },
  { pattern: "test:*", policy: "allow" },
  { pattern: "cd:*", policy: "allow" },
]

/** Read-only git + GitHub CLI subcommands. */
const READONLY_GIT: Rule[] = [
  { pattern: "git status:*", policy: "allow" },
  { pattern: "git log:*", policy: "allow" },
  { pattern: "git diff:*", policy: "allow" },
  { pattern: "git show:*", policy: "allow" },
  { pattern: "git show-ref:*", policy: "allow" },
  { pattern: "git branch:*", policy: "allow" },
  { pattern: "git remote:*", policy: "allow" },
  { pattern: "git rev-parse:*", policy: "allow" },
  { pattern: "git config --get:*", policy: "allow" },
  { pattern: "gh issue list:*", policy: "allow" },
  { pattern: "gh issue view:*", policy: "allow" },
  { pattern: "gh pr list:*", policy: "allow" },
  { pattern: "gh pr view:*", policy: "allow" },
  { pattern: "gh repo view:*", policy: "allow" },
]

/** Common dev workflow commands — build, test, typecheck. Don't include
 *  package management (`npm install`, `bun add`) — those reach the
 *  network and can drag arbitrary code in. */
const DEV_BASIC: Rule[] = [
  { pattern: "bun test:*", policy: "allow" },
  { pattern: "bun test:node:*", policy: "allow" },
  { pattern: "bun test:bun:*", policy: "allow" },
  { pattern: "bun check:*", policy: "allow" },
  { pattern: "bun run:*", policy: "allow" },
  { pattern: "bun build:*", policy: "allow" },
  { pattern: "bunx tsc:*", policy: "allow" },
  { pattern: "bun tsc:*", policy: "allow" },
  { pattern: "bun x tsc:*", policy: "allow" },
  { pattern: "bunx vitest:*", policy: "allow" },
  { pattern: "bun x vitest:*", policy: "allow" },
  { pattern: "bunx oxlint:*", policy: "allow" },
  { pattern: "bun x oxlint:*", policy: "allow" },
  { pattern: "oxlint:*", policy: "allow" },
]

/** Hard denies — never auto-allow, regardless of preset. */
const HARD_DENIES: Rule[] = [{ pattern: "sudo:*", policy: "deny" }]

/** Broader rules unlocked by the permissive preset. Trades some safety
 *  for speed — appropriate for frontier models with strong instruction
 *  following. Includes ad-hoc bun/npm script execution but not package
 *  management or network installers. */
const PERMISSIVE_EXTRAS: Rule[] = [
  { pattern: "bun -e:*", policy: "allow" },
  { pattern: "bun:*", policy: "allow" },
  { pattern: "node:*", policy: "allow" },
  { pattern: "node -e:*", policy: "allow" },
  { pattern: "make:*", policy: "allow" },
  { pattern: "mkdir:*", policy: "allow" },
  { pattern: "cp:*", policy: "allow" },
  { pattern: "mv:*", policy: "allow" },
  { pattern: "touch:*", policy: "allow" },
  { pattern: "ln:*", policy: "allow" },
  { pattern: "chmod:*", policy: "allow" },
  { pattern: "git add:*", policy: "allow" },
  { pattern: "git commit:*", policy: "allow" },
  { pattern: "git checkout:*", policy: "allow" },
  { pattern: "git restore:*", policy: "allow" },
  { pattern: "git stash:*", policy: "allow" },
  { pattern: "git fetch:*", policy: "allow" },
  { pattern: "git pull:*", policy: "allow" },
  { pattern: "curl:*", policy: "allow" },
  { pattern: "jq:*", policy: "allow" },
  { pattern: "perl -e:*", policy: "allow" },
  { pattern: "timeout:*", policy: "allow" },
  { pattern: "for:*", policy: "allow" },
  { pattern: "while:*", policy: "allow" },
]

// ── Presets ──────────────────────────────────────────────────────────────

const askAll = (): Verdict => "ask"
const allowAll = (): Verdict => "allow"

/** Files inside cwd are allowed for read; everything else asks.
 *  Sensitive paths (`.env*`, `.ssh/`, etc.) are denied even within cwd. */
function readFromCwd(): (path: string) => Verdict {
  return combineFileRules([denySensitive(), allowWithin(process.cwd())], "ask")
}

/** Files inside cwd are allowed for write (sensitive paths still denied);
 *  everything else asks. */
function writeInCwd(): (path: string) => Verdict {
  return combineFileRules([denySensitive(), allowWithin(process.cwd())], "ask")
}

// oxlint-disable sort-keys
export const permissionPresets = {
  strict: {
    preset: "strict",
    description: "Ask for everything. No commands or file ops auto-allowed.",
    fallback: "ask",
    rules: [...HARD_DENIES],
    fileRead: askAll,
    fileWrite: askAll,
  },
  readonly: {
    preset: "readonly",
    description:
      "Auto-allow read-only utilities, git read-only ops, and common build/test commands. " +
      "File reads inside cwd are allowed (sensitive paths denied); writes always ask.",
    fallback: "ask",
    rules: [...HARD_DENIES, ...READONLY_TOOLS, ...READONLY_GIT, ...DEV_BASIC],
    fileRead: readFromCwd(),
    fileWrite: askAll,
  },
  permissive: {
    preset: "permissive",
    description:
      "Readonly preset plus broader dev commands (file moves, ad-hoc bun/node evals, " +
      "git mutations, network fetches). Calibrated for frontier models.",
    fallback: "ask",
    rules: [...HARD_DENIES, ...READONLY_TOOLS, ...READONLY_GIT, ...DEV_BASIC, ...PERMISSIVE_EXTRAS],
    fileRead: readFromCwd(),
    fileWrite: writeInCwd(),
  },
  yolo: {
    preset: "yolo",
    description: "Allow everything. No prompts. Use only when you trust the model and the task.",
    fallback: "allow",
    rules: [],
    fileRead: allowAll,
    fileWrite: allowAll,
  },
} as const satisfies Record<PermissionPresetName, PermissionPreset>
