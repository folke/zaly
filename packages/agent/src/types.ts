import type {
  CollectOptions,
  FinishReason,
  Message,
  Model,
  StreamOptions,
  TokenCount,
  Tool,
} from "@zaly/ai"
import type { Agent } from "./agent.ts"
import type { StepKind } from "./events.ts"
import type {
  PermissionManager,
  PermissionOptions,
  PermissionScope,
  PermissionScopes,
  Suggestion,
} from "./permissions/index.ts"
import type { Session } from "./session/index.ts"
import type { StopOptions } from "./stop.ts"
import type { Tasks } from "./tasks.ts"

// Declaration-merge agent-side capabilities into ToolContext. Importing
// any agent code (which any consumer ultimately does) loads this file,
// so tools see properly-typed access to these keys without casts. Each
// is optional because non-agent harnesses (`runTool` called directly,
// tests, evals) may pass a smaller context.
declare module "@zaly/ai" {
  interface ToolContext {
    /** Permissions registry — manager.validate(scope, input) for tools
     *  that gate themselves. */
    perms?: PermissionManager
    /** Long-running task registry. Tools that need to introspect (the
     *  task management tools) read it; ordinary tools can stay
     *  Tasks-unaware and return a `Streamable` instead. */
    tasks?: Tasks
    messages?: readonly Message[]
    /** Async permission check tools call before doing work. Resolves on
     *  `allow`, throws a `ToolError(PERMISSION_DENIED)` on `deny`. For
     *  `ask` verdicts, the agent invokes `AgentOptions.allow` (when
     *  configured); if that returns `true` we resolve, otherwise we
     *  throw. Absent on contexts without an Agent (eval / direct
     *  `runTool`) — tools should treat a missing `need` as "no
     *  permission system, allow."
     *
     *  Two layers of gating exist:
     *    - `Tasks` auto-checks `tool` scope with the tool name on every
     *      dispatch (so `tool(bash)` rules globally gate by name).
     *    - Tools may opt into richer per-input checks via specialized
     *      scopes (`bash(args.command)`, `read(path)`, …).
     *
     *  Scope names autocomplete from the `PermissionScopes` interface;
     *  add your own via declaration merging. */
    need?: <S extends PermissionScope>(scope: S, input: PermissionScopes[S]) => Promise<void>
  }
}

/** Information passed to `AgentOptions.allow` when an `ask` verdict
 *  needs interactive resolution. Carry-everything shape so the harness
 *  can render a useful prompt: which scope, which input, why the
 *  manager paused, and what rule (if added) would have allowed it. */
export interface PermissionRequest {
  scope: string
  input: string
  reason: string
  suggestions?: Suggestion[]
}

/** Outcome of a single step (one provider round-trip + tool batch).
 *  Returned from `step()` so custom drivers can interleave their own
 *  logic between steps. */
export interface StepResult {
  kind: StepKind
  message?: Message<"assistant">
  toolMessage?: Message<"tool">
  finishReason: FinishReason
  usage: TokenCount
  error?: Error
}

/** Options for constructing an `Agent`. */
export interface AgentOptions extends CollectOptions {
  model: Model
  /** Tools the model may call. Kernel-owned: the agent both passes
   *  these to the provider on every step and dispatches calls against
   *  them. Mutable post-construction via `agent.tools = …`. */
  tools?: Tool[]
  /** Stop-policy knobs — `maxSteps`, `tokenBudget`, `maxToolErrors`,
   *  loop-detection tuning. Grouped under one key to keep the agent's
   *  top-level surface focused. Omit to use defaults (see `StopPolicy`). */
  stop?: StopOptions
  /** Either `PermissionOptions` (construct a fresh manager) or an
   *  existing `PermissionManager` instance to reuse — used by subagents
   *  to share the parent's workspaces + rules without copying. */
  permissions?: PermissionOptions | PermissionManager
  /** Per-call passthrough knobs (`temperature`, `toolChoice`,
   *  `reasoning`, `responseFormat`, …). The agent owns `model`,
   *  `messages`, `prompt`, and `tools` — those have dedicated
   *  top-level fields here. */
  request?: StreamOptions
  /** Pre-built `Session` to use. Useful for resuming a persisted
   *  conversation or for sharing one Session across multiple Agents
   *  (e.g. swapping models). When omitted, a fresh in-memory Session
   *  is created. Either way, `messages` (if any) are appended to it. */
  session?: Session
  /** Initial messages appended to the session at construction. Useful
   *  for seeding a fresh conversation or for prepending fixed context
   *  to an existing session. */
  messages?: Message[]
  /** Durable system prompt — passed to every step's request and
   *  routed by adapters to each provider's dedicated system slot. Use
   *  this for "behave like X" instructions that don't change across
   *  the session. For mid-conversation steering, `send()` a
   *  `role: "system"` message instead. Mutable via `agent.prompt = …`. */
  prompt?: string[]
  /** Model's declared context window — enables silent-overflow detection. */
  contextLimit?: number
  /** Nesting depth of this agent. `0` = top-level (user-facing).
   *  Subagents bump this by 1 each time they spawn. The `subagent` tool
   *  consults this to decide whether to expose itself to the spawned
   *  child — at depth `maxDepth`, the child gets the parent's tool list
   *  *without* the subagent tool, so recursion bottoms out cleanly.
   *  Defaults to `0`. */
  depth?: number
  /** Maximum allowed agent depth. Subagents at depth `< maxDepth` may
   *  spawn further subagents; at depth `>= maxDepth`, the subagent tool
   *  is filtered out of their tool list (no error — the model just
   *  doesn't see it). Defaults to `2`, giving root → child → grandchild.
   *  Top-level only — children inherit this from the parent at spawn
   *  time. */
  maxDepth?: number
  /** Enable the built-in `skill` tool (Agent Skills support). When
   *  `true` (default), the agent constructs a `Skills` instance, scans
   *  `${cwd}/.agent/skills/` and `~/.agent/skills/` on `skills.load()`,
   *  and exposes the activation tool to the model. Set `false` to skip
   *  skills entirely (no `skills` getter, no scanning, no tool). */
  skills?: boolean

  /** Heartbeat interval (ms) for the Tasks registry. While at least one
   *  task is pending or running, the agent injects a `<heartbeat>` system
   *  message at this cadence so the model sees what's still going and
   *  the loop stays alive. Leave undefined to disable. Tune for the
   *  workload — interactive sessions often want 30s; batch / autonomous
   *  runs may want 5m. */
  heartbeatMs?: number

  // ── Recovery ───────────────────────────────────────────────────────
  /** Resolver for `ask` permission verdicts. The agent invokes this
   *  with the scope / input / reason / suggestions; resolve `true` to
   *  allow the call, `false` to deny. Absent → ask defaults to deny.
   *
   *  Hook a TUI prompt here, or return `true` unconditionally for
   *  unattended runs that should treat ask as allow (yolo-but-richer). */
  allow?: (req: PermissionRequest) => Promise<boolean>

  /** Called when a step returns `context-overflow`. Should mutate the
   *  session (via `agent.session.compact()` after producing a summary)
   *  to fit within the context window. After it resolves the loop
   *  retries from the compacted state. If absent, overflow stops the
   *  loop. */
  compact?: (agent: Agent) => void | Promise<void>
}
