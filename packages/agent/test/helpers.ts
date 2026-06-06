import type { Message, ModelStreamOptions, StreamEvent, TokenCount } from "@zaly/ai"
import type { Agent } from "../src/agent.ts"
import type { AgentStopKind } from "../src/events.ts"
import type { TokenUsage } from "../src/index.ts"
import type { AgentOptions } from "../src/types.ts"

import { Model } from "@zaly/ai"
import { normPath } from "@zaly/shared"
import { createAgent } from "../src/context.ts"
import { loadClaudeSession } from "../src/session/claude.ts"
import { Session } from "../src/session/index.ts"

/** Build a minimal `Model` from a list of scripted stream-event arrays
 *  (one per turn). Only the fields `Agent` reads are populated. */
/** Minimal ModelSpec satisfying the now-required `limit` / `modalities`
 *  fields. Shared by all mock model factories so consumers like
 *  `Notifier` (context-pressure %), `Model.stream` (max-tokens default),
 *  and the prompt registry can read those fields without crashes.
 *  Numbers chosen large enough that test scenarios never accidentally
 *  trip thresholds. */
const mockSpec: Model["spec"] = {
  id: "x",
  model: "x",
  contextSize: 1_000_000,
  maxTokens: 16_000,
  input: ["text", "image"],
  output: ["text"],
  name: "mock",
  api: "mock",
  reasoning: false,
}

/** Drive `collect` over a script of stream events while honoring
 *  `onEvent` / `onUpdate` callbacks the agent passes in. Stamps the
 *  meta the way `Model.stream` would so the agent sees the same shape
 *  in tests as in production. */
async function* fakeStream(events: StreamEvent[]): AsyncIterable<StreamEvent> {
  for (const ev of events) yield ev
}

export function mockModel(scripts: StreamEvent[][]): Model {
  let turn = 0
  return new Model({
    id: "mock/x",
    spec: mockSpec,
    provider: {
      stream: (_ctx: never, _opts: ModelStreamOptions = {}) => {
        const events = scripts[turn++]
        return fakeStream(events)
      },
    } as Model["provider"],
  })
}

/** Build a `Model` whose `stream` blocks until `release(events)` is
 *  called. Lets tests exercise send/inject/pause/abort against a turn
 *  that's actually in flight, instead of one that completes in a
 *  single microtask. Each `release` feeds the next pending stream. */
export function pendingModel(): {
  model: Model
  release: (events: StreamEvent[]) => void
  pending: number
} {
  const waiting: ((events: StreamEvent[]) => void)[] = []
  const state = {
    get pending() {
      return waiting.length
    },
    model: new Model({
      id: "mock/x",
      spec: mockSpec,
      provider: {
        async *stream(_ctx: never, _opts: ModelStreamOptions = {}): AsyncIterable<StreamEvent> {
          const events = await new Promise<StreamEvent[]>((res) => waiting.push(res))
          return yield* fakeStream(events)
        },
      } as Model["provider"],
    }),
    release(events: StreamEvent[]): void {
      const next = waiting.shift()
      if (!next) throw new Error("pendingModel.release: no pending stream")
      next(events)
    },
  }
  return state
}

/** Build a `Model` whose `stream` always throws the given message —
 *  used to exercise error / overflow paths. */
export function throwingModel(message: string): Model {
  return {
    id: "mock/x",
    spec: mockSpec,
    provider: {} as Model["provider"],
    async stream() {
      throw new Error(message)
    },
  } as unknown as Model
}

/** One-shot wrapper around `Agent`. Convenient for tests, evals, and
 *  headless batch jobs that don't need the interactive session
 *  machinery. Equivalent to:
 *
 *  ```ts
 *  const a = await Agent.load(opts)
 *  if (firstMessage) a.send(firstMessage)
 *  await a.run()
 *  ``` */
/** Test-mode wrapper around `Agent.load`. Disables the runtime
 *  notifier by default so injected `<session-started>` / `<time>` /
 *  `<context-pressure>` / etc. messages don't pollute test assertions
 *  about conversation contents. Tests that *want* notifications can
 *  pass `notify: true` (or a `NotifyOptions` object) explicitly.
 *
 *  Eagerly starts the agent — tests typically inspect agent state
 *  (tools, prompt, skills, session) right after construction, so we
 *  pay the start cost upfront. Production callers (cli) drive
 *  start() themselves to control event-subscription timing. */
export async function loadAgent(opts: AgentOptions): Promise<Agent> {
  const agent = await createAgent({ notify: false, ...opts })
  await agent.start()
  return agent
}

export async function runAgent(
  opts: AgentOptions & { send?: Message<"user" | "system"> }
): Promise<{
  messages: Message[]
  /** Last step's usage. */
  usage: TokenUsage
  /** Cumulative usage across the run. */
  totalUsage: TokenCount
  stopReason: AgentStopKind
  steps: number
  error?: Error
}> {
  const agent = await loadAgent(opts)
  if (opts.send) agent.send(opts.send)
  const stopReason = await agent.run()
  return {
    error: agent.lastStop?.error,
    messages: [...agent.messages],
    steps: agent.steps,
    stopReason,
    totalUsage: agent.totalUsage,
    usage: agent.usage,
  }
}

/** Load a session for harness scripts. Detects Claude Code session
 *  files (path contains `.claude`) and converts on the fly into an
 *  in-memory zaly Session; otherwise loads the path as a native zaly
 *  session JSONL. Used by `test/compaction.ts` and `test/masker.ts`. */
export async function loadSession(path: string, opts?: { limit?: number }): Promise<Session> {
  path = normPath(path)
  if (path.includes(".claude")) {
    const { messages } = await loadClaudeSession(path, { walk: "all" })

    const s = await Session.load() // in-memory, no path
    await s.start()
    for (const m of messages.slice(-(opts?.limit ?? 2000))) {
      await s.add(m)
    }
    return s
  }
  return Session.load({ path })
}
