import type { Message, Model, StreamEvent, TokenCount } from "@zaly/ai"
import type { AgentStopReason } from "../src/events.ts"
import type { AgentOptions } from "../src/types.ts"

import { Agent } from "../src/agent.ts"

/** Build a minimal `Model` from a list of scripted stream-event arrays
 *  (one per turn). Only the fields `Agent` reads are populated. */
export function mockModel(scripts: StreamEvent[][]): Model {
  // oxlint-disable-next-line no-unused-vars -- closure mutation
  let turn = 0
  return {
    id: "mock/x",
    options: { id: "x", provider: "mock" } as Model["options"],
    provider: {} as Model["provider"],
    async *stream() {
      for (const ev of scripts[turn++]) yield ev
    },
  } as Model
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
      options: {} as Model["options"],
      provider: {} as Model["provider"],
      async *stream() {
        const events = await new Promise<StreamEvent[]>((res) => waiting.push(res))
        for (const ev of events) yield ev
      },
    } as Model,
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
    options: {} as Model["options"],
    provider: {} as Model["provider"],
    // eslint-disable-next-line require-yield
    async *stream() {
      throw new Error(message)
    },
  } as Model
}

/** One-shot wrapper around `Agent`. Convenient for tests, evals, and
 *  headless batch jobs that don't need the interactive session
 *  machinery. Equivalent to:
 *
 *  ```ts
 *  const a = new Agent(opts)
 *  if (firstMessage) a.send(firstMessage)
 *  await a.run()
 *  ``` */
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
  const agent = new Agent(opts)
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
