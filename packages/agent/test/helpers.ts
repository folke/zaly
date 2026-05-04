import type { Message, Model, StreamEvent, TokenCount } from "@zaly/ai"
import type { AgentStopReason } from "../src/events.ts"
import type { AgentOptions } from "../src/types.ts"

import { Agent } from "../src/agent.ts"
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
const mockSpec = {
  attachment: true,
  id: "x",
  limit: { context: 1_000_000, output: 16_000 },
  modalities: { input: ["text", "image"], output: ["text"] },
  name: "mock",
  provider: "mock",
  reasoning: false,
} as unknown as Model["spec"]

export function mockModel(scripts: StreamEvent[][]): Model {
  // oxlint-disable-next-line no-unused-vars -- closure mutation
  let turn = 0
  return {
    id: "mock/x",
    spec: mockSpec,
    provider: {} as Model["provider"],
    async *stream() {
      for (const ev of scripts[turn++]) yield ev
    },
  } as unknown as Model
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
    model: {
      id: "mock/x",
      spec: mockSpec,
      provider: {} as Model["provider"],
      async *stream() {
        const events = await new Promise<StreamEvent[]>((res) => waiting.push(res))
        for (const ev of events) yield ev
      },
    } as unknown as Model,
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
    // eslint-disable-next-line require-yield
    async *stream() {
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
 *  pass `notify: true` (or a `NotifyOptions` object) explicitly. */
export async function loadAgent(opts: AgentOptions): Promise<Agent> {
  return Agent.load({ notify: false, ...opts })
}

export async function runAgent(
  opts: AgentOptions & { send?: Message<"user" | "system"> }
): Promise<{
  messages: Message[]
  /** Last step's usage. */
  usage: TokenCount
  /** Cumulative usage across the run. */
  totalUsage: TokenCount
  stopReason: AgentStopReason
  steps: number
  error?: Error
}> {
  const agent = await loadAgent(opts)
  if (opts.send) agent.send(opts.send)
  const stopReason = await agent.run()
  return {
    error: agent.lastError,
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
  if (path.includes(".claude")) {
    const { messages, metas } = await loadClaudeSession(path, { walk: "all" })
    const s = await Session.load() // in-memory, no path
    await s.start()
    for (const m of messages.slice(-(opts?.limit ?? 2000))) {
      await s.add(m, m.id ? metas.get(m.id) : undefined)
    }
    return s
  }
  return Session.load({ path })
}
