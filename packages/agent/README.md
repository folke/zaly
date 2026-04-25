# @zaly/agent

The zaly agent kernel: an `AgentSession` that owns a multi-turn conversation, drives the streaming + tool loop, and exposes hooks for steering, pause/abort, compaction, and persistence. Built on top of [`@zaly/ai`](../ai) — UI-agnostic, so the same kernel runs the CLI, server, desktop, and channel adapters.

## Install

```sh
bun add @zaly/agent @zaly/ai
```

## Quickstart

```ts
import { Type } from "typebox"
import { defineTool, loadModel } from "@zaly/ai"
import { AgentSession } from "@zaly/agent"

const multiply = defineTool({
  name: "multiply",
  desc: "multiply two numbers",
  params: Type.Object({ a: Type.Number(), b: Type.Number() }),
  call: ({ a, b }) => a * b,
})

const model = await loadModel("openai/gpt-4o-mini")

const session = new AgentSession({
  model,
  request: { tools: [multiply] },
})

session.send({ content: "What is 17 × 23?", role: "user" })
const stopReason = await session.run()

console.log(stopReason)              // "natural"
console.log(session.messages.at(-1)) // assistant final message
console.log(session.usage)           // summed token usage
```

## Interactive use

`send()` is the input verb. It appends the user message and auto-starts the loop if idle; if a turn is already in flight, it queues for after the current one stops naturally. `inject()` is for the rarer "interrupt this turn with a new instruction" case — the message lands inline before the next step.

```ts
const off = session.on((event) => {
  // status, stream-event, message, replace, tool-call, tool-result, step-end, stop
})

session.send({ content: "find all .ts files", role: "user" })
// …user types again mid-turn…
session.send({ content: "actually, just src/", role: "user" })  // queued, runs after
// …or interrupt the current turn:
session.inject({ content: "skip tests", role: "user" })

session.pause()                  // graceful stop after current step
session.abort()                  // hard kill the in-flight stream
await session.run()              // resume from paused / errored (also auto-runs on send)
```

Status is one of `idle | streaming | running-tools | paused`. `paused` covers post-error too — `session.lastError` carries the cause.

## Stop reasons

Each `run()` resolves with an `AgentStopReason`:

- `natural` — model returned without a tool call and no follow-ups queued
- `max-steps` — hit `maxSteps` (default 50)
- `token-budget` — `usage.input + usage.output` exceeded `tokenBudget`
- `loop-detected` — built-in loop heuristic flagged repetition (see below)
- `max-tool-errors` — too many consecutive failing tool calls
- `context-overflow` — request overflowed the context window (regex-detected from error messages or compared against `contextLimit`)
- `paused` — `pause()` was called between steps
- `aborted` — stream killed via `abort()`
- `error` — a non-recoverable error; see `session.lastError`

`stopReason` is the loop-level outcome. The provider's per-round-trip `finishReason` is emitted on each `step-end` event.

## Caps, budgets, and loop detection

All policy knobs live on the session options and are routed to the
internal `StopPolicy`. Defaults below.

```ts
new AgentSession({
  // …
  maxSteps: 50,             // hard ceiling on provider round-trips per run()
  maxToolErrors: 5,         // bail after N consecutive failing tool calls
  tokenBudget: 100_000,     // cumulative usage cap across the run
  contextLimit: 128_000,    // model's context window — enables silent-overflow detection

  // Loop detection (cheap heuristics over tool-call history)
  loopConsecutive: 3,       // same call N times in a row → loop-detected
  loopWindow: 10,           // window for the second arm
  loopWindowRepeats: 4,     // duplicates within the window → loop-detected
})
```

Set any loop-detection limit to `Infinity` to disable that arm. For
fully custom logic, subclass `StopPolicy` and inject your own.

## Compaction on overflow

When a step returns `context-overflow`, the assistant message from that round-trip is *not* committed (it was generated against truncated input, so its quality is suspect). If you supply a `compact` callback the loop will retry after compaction; otherwise it stops with `stopReason: "context-overflow"`.

```ts
new AgentSession({
  // …
  contextLimit: model.options.limit.context,
  compact: async (session) => {
    const next = await summarize(session.messages)
    session.replace(next)
  },
})
```

## Persistence

`session.serialize()` returns a `SessionSnapshot` with messages, accumulated usage, and `lastStopReason`/`lastError`. Sufficient to rebuild an `AgentSession` for resumption (rehydration helper is on the roadmap).

## Custom drivers

For tests or unusual control flow, `step()` runs exactly one step and returns `StepResult`. The loop in `run()` is just `step()` + the cap/queue checks; you can write your own driver if the built-in policy doesn't fit.

## Status

Pre-0.1, in active development. Base tools, prompt assembly, persistence rehydration, and channel-adapter integration are landing next.

## License

[MIT](./LICENSE) © Folke Lemaitre
