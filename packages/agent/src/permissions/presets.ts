import type { Verdict } from "./types.ts"

/**
 * Permission presets — verdict-keyed pattern lists in the same shape
 * `parseRules` accepts. The TUI exposes these as `--preset strict`,
 * `--preset readonly`, etc.; the manager resolves the chosen preset to
 * the structured `Rule<string>[]` at construction.
 *
 * Pattern grammar:
 *   "bash(ls:*)"     → bash command pattern
 *   "read(/src/**)"  → workspace-relative gitignore pattern
 *   "read(*)"        → matches every read in any workspace
 *   "bash"           → bare scope, equivalent to `bash(*)` (match any cmd)
 *
 * Scope names are exact matches against the tool name they gate
 * (snake_case). Underscored scopes work too (`task_stop`, `task_poll`).
 */
export type PermissionPresetName = "strict" | "readonly" | "permissive" | "yolo"

export interface PermissionPreset {
  description: string
  rules: Partial<Record<Verdict, string[]>>
}

// ── Pattern groups ─────────────────────────────────────────────────────────

/** Native tools that only inspect session state or workspace files. */
const READONLY_TOOLS = [
  "tool(read)",
  "tool(grep)",
  "tool(find)",
  "tool(task_list)",
  "tool(task_poll)",
]

/** Read-only utilities the model can run without surprises: file
 *  inspection, search, metadata. None of these modify state on their own.
 *  (`sed`/`awk` writes still gated by Write rules via the bash handler's
 *  composition with the file handler.) */
const READONLY_BASH = [
  "bash(ls:*)",
  "bash(cat:*)",
  "bash(head:*)",
  "bash(tail:*)",
  "bash(wc:*)",
  "bash(find:*)",
  "bash(grep:*)",
  "bash(rg:*)",
  "bash(fd:*)",
  "bash(sort:*)",
  "bash(uniq:*)",
  "bash(cut:*)",
  "bash(diff:*)",
  "bash(stat:*)",
  "bash(file:*)",
  "bash(realpath:*)",
  "bash(readlink:*)",
  "bash(basename:*)",
  "bash(dirname:*)",
  "bash(echo:*)",
  "bash(printf:*)",
  "bash(sed:*)",
  "bash(awk:*)",
  "bash(xxd:*)",
  "bash(hexdump:*)",
  "bash(od:*)",
  "bash(tree:*)",
  "bash(pwd)",
  "bash(true)",
  "bash(false)",
  "bash(which:*)",
  "bash(type:*)",
  "bash(command:*)",
  "bash(test:*)",
  "bash(cd:*)",
]

/** Read-only git + GitHub CLI subcommands. */
const READONLY_GIT = [
  "bash(git status:*)",
  "bash(git log:*)",
  "bash(git diff:*)",
  "bash(git show:*)",
  "bash(git show-ref:*)",
  "bash(git branch:*)",
  "bash(git remote:*)",
  "bash(git rev-parse:*)",
  "bash(git config --get:*)",
  "bash(gh issue list:*)",
  "bash(gh issue view:*)",
  "bash(gh pr list:*)",
  "bash(gh pr view:*)",
  "bash(gh repo view:*)",
]

/** Common dev-workflow commands — build, test, typecheck. Excludes
 *  package management (`npm install`, `bun add`) which can drag arbitrary
 *  code in over the network. */
const DEV_BASIC = [
  "bash(bun test:*)",
  "bash(bun test:node:*)",
  "bash(bun test:bun:*)",
  "bash(bun check:*)",
  "bash(bun run:*)",
  "bash(bun build:*)",
  "bash(bunx tsc:*)",
  "bash(bun tsc:*)",
  "bash(bun x tsc:*)",
  "bash(bunx vitest:*)",
  "bash(bun x vitest:*)",
  "bash(bunx oxlint:*)",
  "bash(bun x oxlint:*)",
  "bash(oxlint:*)",
]

/** Hard denies — never auto-allowed, regardless of preset. */
const HARD_DENIES = ["bash(sudo:*)"]

/** Broader rules unlocked by the permissive preset. Trades some safety
 *  for speed — appropriate for frontier models with strong instruction
 *  following. Includes ad-hoc bun/node evals and git mutations. */
const PERMISSIVE_EXTRAS = [
  "bash(bun -e:*)",
  "bash(bun:*)",
  "bash(node:*)",
  "bash(node -e:*)",
  "bash(make:*)",
  "bash(mkdir:*)",
  "bash(cp:*)",
  "bash(mv:*)",
  "bash(touch:*)",
  "bash(ln:*)",
  "bash(chmod:*)",
  "bash(git add:*)",
  "bash(git commit:*)",
  "bash(git checkout:*)",
  "bash(git restore:*)",
  "bash(git stash:*)",
  "bash(git fetch:*)",
  "bash(git pull:*)",
  "bash(curl:*)",
  "bash(jq:*)",
  "bash(perl -e:*)",
  "bash(timeout:*)",
  "bash(for:*)",
  "bash(while:*)",
]

// ── Presets ────────────────────────────────────────────────────────────────

// oxlint-disable sort-keys
export const permissionPresets = {
  strict: {
    description: "Ask for everything. No commands or file ops auto-allowed.",
    rules: {
      deny: HARD_DENIES,
      // Override the tool/file handlers' default allows.
      ask: ["tool(*)", "read(*)", "write(*)"],
    },
  },
  readonly: {
    description:
      "Auto-allow read-only utilities, git read-only ops, and common build/test commands. " +
      "Reads inside the workspace are allowed (sensitive paths denied); writes always ask.",
    rules: {
      deny: HARD_DENIES,
      allow: [...READONLY_TOOLS, ...READONLY_BASH, ...READONLY_GIT, ...DEV_BASIC],
      ask: ["tool(*)", "write(*)"],
    },
  },
  permissive: {
    description:
      "Readonly preset plus broader dev commands (file moves, ad-hoc bun/node evals, " +
      "git mutations, network fetches) and writes inside the workspace.",
    rules: {
      deny: HARD_DENIES,
      allow: [
        "tool(*)",
        ...READONLY_BASH,
        ...READONLY_GIT,
        ...DEV_BASIC,
        ...PERMISSIVE_EXTRAS,
        // Allow writes inside any workspace (sensitive paths still denied
        // by the file handler before rule resolution).
        "write(*)",
      ],
    },
  },
  yolo: {
    description: "Allow everything. No prompts. Use only when you trust the model and the task.",
    rules: {
      allow: ["bash", "read(*)", "write(*)", "tool(*)"],
    },
  },
} as const satisfies Record<PermissionPresetName, PermissionPreset>
