import type { Message, Model, StreamEvent, TokenCount } from "@zaly/ai"
import type { AgentStopReason } from "../src/events.ts"
import type { AgentSessionOptions } from "../src/types.ts"

import { AgentSession } from "../src/agent.ts"

/** Build a minimal `Model` from a list of scripted stream-event arrays
 *  (one per turn). Only the fields `AgentSession` reads are populated. */
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

/** One-shot wrapper around `AgentSession`. Convenient for tests,
 *  evals, and headless batch jobs that don't need the interactive
 *  session machinery. Equivalent to:
 *
 *  ```ts
 *  const s = new AgentSession(opts)
 *  if (firstMessage) s.send(firstMessage)
 *  await s.run()
 *  ```
 *
 *  Returns the resulting messages, summed usage, and the loop's stop
 *  reason — same shape as the old `runAgentTurn`. */
export async function runAgentTurn(
  opts: AgentSessionOptions & { send?: Message<"user" | "system"> }
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
  const session = new AgentSession(opts)
  if (opts.send) session.send(opts.send)
  const stopReason = await session.run()
  return {
    error: session.lastError,
    messages: [...session.messages],
    steps: session.steps,
    stopReason,
    totalUsage: session.totalUsage,
    usage: session.usage,
  }
}
