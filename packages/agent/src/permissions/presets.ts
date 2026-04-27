import type { Verdict } from "./types.ts"

/**
 * Permission presets — verdict-keyed pattern lists in the same shape
 * `parseRules` accepts. The TUI exposes these as `--preset strict`,
 * `--preset readonly`, etc.; the manager resolves the chosen preset to
 * the structured `Rule<string>[]` at construction.
 *
 * Pattern grammar:
 *   "Bash(ls:*)"   → bash command pattern
 *   "Read(/src/**)" → workspace-relative gitignore pattern
 *   "Read(*)"       → matches every read in any workspace
 *   "Bash"          → bare scope, equivalent to `Bash(*)` (match any cmd)
 */
export type PermissionPresetName = "strict" | "readonly" | "permissive" | "yolo"

export interface PermissionPreset {
  description: string
  rules: Partial<Record<Verdict, string[]>>
}

// ── Pattern groups ─────────────────────────────────────────────────────────

/** Read-only utilities the model can run without surprises: file
 *  inspection, search, metadata. None of these modify state on their own.
 *  (`sed`/`awk` writes still gated by Write rules via the bash handler's
 *  composition with the file handler.) */
const READONLY_BASH = [
  "Bash(ls:*)",
  "Bash(cat:*)",
  "Bash(head:*)",
  "Bash(tail:*)",
  "Bash(wc:*)",
  "Bash(find:*)",
  "Bash(grep:*)",
  "Bash(rg:*)",
  "Bash(fd:*)",
  "Bash(sort:*)",
  "Bash(uniq:*)",
  "Bash(cut:*)",
  "Bash(diff:*)",
  "Bash(stat:*)",
  "Bash(file:*)",
  "Bash(realpath:*)",
  "Bash(readlink:*)",
  "Bash(basename:*)",
  "Bash(dirname:*)",
  "Bash(echo:*)",
  "Bash(printf:*)",
  "Bash(sed:*)",
  "Bash(awk:*)",
  "Bash(xxd:*)",
  "Bash(hexdump:*)",
  "Bash(od:*)",
  "Bash(tree:*)",
  "Bash(pwd)",
  "Bash(true)",
  "Bash(false)",
  "Bash(which:*)",
  "Bash(type:*)",
  "Bash(command:*)",
  "Bash(test:*)",
  "Bash(cd:*)",
]

/** Read-only git + GitHub CLI subcommands. */
const READONLY_GIT = [
  "Bash(git status:*)",
  "Bash(git log:*)",
  "Bash(git diff:*)",
  "Bash(git show:*)",
  "Bash(git show-ref:*)",
  "Bash(git branch:*)",
  "Bash(git remote:*)",
  "Bash(git rev-parse:*)",
  "Bash(git config --get:*)",
  "Bash(gh issue list:*)",
  "Bash(gh issue view:*)",
  "Bash(gh pr list:*)",
  "Bash(gh pr view:*)",
  "Bash(gh repo view:*)",
]

/** Common dev-workflow commands — build, test, typecheck. Excludes
 *  package management (`npm install`, `bun add`) which can drag arbitrary
 *  code in over the network. */
const DEV_BASIC = [
  "Bash(bun test:*)",
  "Bash(bun test:node:*)",
  "Bash(bun test:bun:*)",
  "Bash(bun check:*)",
  "Bash(bun run:*)",
  "Bash(bun build:*)",
  "Bash(bunx tsc:*)",
  "Bash(bun tsc:*)",
  "Bash(bun x tsc:*)",
  "Bash(bunx vitest:*)",
  "Bash(bun x vitest:*)",
  "Bash(bunx oxlint:*)",
  "Bash(bun x oxlint:*)",
  "Bash(oxlint:*)",
]

/** Hard denies — never auto-allowed, regardless of preset. */
const HARD_DENIES = ["Bash(sudo:*)"]

/** Broader rules unlocked by the permissive preset. Trades some safety
 *  for speed — appropriate for frontier models with strong instruction
 *  following. Includes ad-hoc bun/node evals and git mutations. */
const PERMISSIVE_EXTRAS = [
  "Bash(bun -e:*)",
  "Bash(bun:*)",
  "Bash(node:*)",
  "Bash(node -e:*)",
  "Bash(make:*)",
  "Bash(mkdir:*)",
  "Bash(cp:*)",
  "Bash(mv:*)",
  "Bash(touch:*)",
  "Bash(ln:*)",
  "Bash(chmod:*)",
  "Bash(git add:*)",
  "Bash(git commit:*)",
  "Bash(git checkout:*)",
  "Bash(git restore:*)",
  "Bash(git stash:*)",
  "Bash(git fetch:*)",
  "Bash(git pull:*)",
  "Bash(curl:*)",
  "Bash(jq:*)",
  "Bash(perl -e:*)",
  "Bash(timeout:*)",
  "Bash(for:*)",
  "Bash(while:*)",
]

// ── Presets ────────────────────────────────────────────────────────────────

// oxlint-disable sort-keys
export const permissionPresets = {
  strict: {
    description: "Ask for everything. No commands or file ops auto-allowed.",
    rules: {
      deny: HARD_DENIES,
      // Override the file handler's default-allow-on-read inside workspace.
      ask: ["Read(*)", "Write(*)"],
    },
  },
  readonly: {
    description:
      "Auto-allow read-only utilities, git read-only ops, and common build/test commands. " +
      "Reads inside the workspace are allowed (sensitive paths denied); writes always ask.",
    rules: {
      deny: HARD_DENIES,
      allow: [...READONLY_BASH, ...READONLY_GIT, ...DEV_BASIC],
    },
  },
  permissive: {
    description:
      "Readonly preset plus broader dev commands (file moves, ad-hoc bun/node evals, " +
      "git mutations, network fetches) and writes inside the workspace.",
    rules: {
      deny: HARD_DENIES,
      allow: [
        ...READONLY_BASH,
        ...READONLY_GIT,
        ...DEV_BASIC,
        ...PERMISSIVE_EXTRAS,
        // Allow writes inside any workspace (sensitive paths still denied
        // by the file handler before rule resolution).
        "Write(*)",
      ],
    },
  },
  yolo: {
    description: "Allow everything. No prompts. Use only when you trust the model and the task.",
    rules: {
      allow: ["Bash", "Read(*)", "Write(*)"],
    },
  },
} as const satisfies Record<PermissionPresetName, PermissionPreset>
