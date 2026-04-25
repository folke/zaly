# @zaly/agent

The zaly agent kernel. Two primitives:

- **`Session`** — owns the conversation as a DAG of message + compaction nodes, with a head pointer. Branching, rewind, and replay all reduce to *navigate to a uuid*. Optional JSONL persistence.
- **`Agent`** — drives the multi-turn streaming + tool loop on top of a `Session`. Owns runtime status, the message queues (`send`/`inject`), and the stop policy.

Built on [`@zaly/ai`](../ai). UI-agnostic — the same kernel runs CLI, server, desktop, and channel adapters.

## Install

```sh
bun add @zaly/agent @zaly/ai typebox
```

## Quickstart

```ts
import { Type } from "typebox"
import { defineTool, loadModel } from "@zaly/ai"
import { Agent } from "@zaly/agent"

const multiply = defineTool({
  name: "multiply",
  desc: "multiply two numbers",
  params: Type.Object({ a: Type.Number(), b: Type.Number() }),
  call: ({ a, b }) => a * b,
})

const model = await loadModel("openai/gpt-4o-mini")

const agent = new Agent({
  model,
  tools: [multiply],
})

agent.send({ content: "What is 17 × 23?", role: "user" })
const stopReason = await agent.run()

console.log(stopReason)             // "natural"
console.log(agent.messages.at(-1))  // assistant final message
console.log(agent.totalUsage)       // summed token usage across the run
```

## Interactive use

`send()` is the input verb. It appends the user message and auto-starts the loop if idle; if a turn is already in flight, it queues for after the current step's natural stop. `inject()` is the rarer "interrupt this turn with a new instruction" case — the message lands inline before the next step.

```ts
// Conversation events live on the Session — render incoming messages here.
agent.session.on("node", (e) => {
  if (e.node.type === "message") render(e.node.message)
})

// Loop / status events live on the Agent.
agent.on("status", (e) => updateSpinner(e.status))
agent.on("stream-event", (e) => /* deltas for typing UI */)
agent.on("tool-call", (e) => log(`→ ${e.call.name}`))
agent.on("tool-result", (e) => log(`← ${e.call.name}`))
agent.on("stop", (e) => log(`stopped: ${e.reason}`))

agent.send({ content: "find all .ts files", role: "user" })
// …user types again mid-turn…
agent.send({ content: "actually, just src/", role: "user" })  // queued, runs after
// …or interrupt the current turn:
agent.inject({ content: "skip tests", role: "user" })

agent.pause()           // graceful stop after current step
agent.abort()           // hard kill the in-flight stream (lands paused)
await agent.run()       // resume from paused / errored (also auto-runs on send)
```

`status` is one of `idle | streaming | running-tools | paused`. `paused` covers post-error too — `agent.lastError` carries the cause.

`prompt` and `tools` are mutable post-construction; assignments take effect on the *next* step (the in-flight stream keeps its original values):

```ts
agent.prompt = ["you are now in safe mode"]
agent.tools = [readOnlyTool]
```

## Stop reasons

Each `run()` resolves with an `AgentStopReason`:

- `natural` — model returned without a tool call and no follow-ups queued
- `max-steps` — hit `policy.maxSteps` (default 50)
- `token-budget` — cumulative usage exceeded `policy.tokenBudget`
- `loop-detected` — built-in loop heuristic flagged repetition (see below)
- `max-tool-errors` — too many consecutive failing tool calls
- `context-overflow` — request overflowed the context window (regex-detected from error messages or compared against `contextLimit`)
- `paused` — `pause()` was called between steps
- `aborted` — stream killed via `abort()`
- `error` — a non-recoverable error; see `agent.lastError`

`stopReason` is the loop-level outcome. The provider's per-round-trip `finishReason` is emitted on each `step-end` event.

## Caps, budgets, and loop detection

Policy knobs live under `policy` and are routed to the internal `StopPolicy`. Defaults below.

```ts
new Agent({
  // …
  contextLimit: 128_000,    // model's context window — enables silent-overflow detection
  policy: {
    maxSteps: 50,           // hard ceiling on provider round-trips per run()
    maxToolErrors: 5,       // bail after N consecutive failing tool calls
    tokenBudget: 100_000,   // cumulative usage cap across the run

    // Loop detection (cheap heuristics over tool-call history)
    loopConsecutive: 3,     // same call N times in a row → loop-detected
    loopWindow: 10,         // window for the second arm
    loopWindowRepeats: 4,   // duplicates within the window → loop-detected
  },
})
```

Set any loop-detection limit to `Infinity` to disable that arm. For fully custom logic, subclass `StopPolicy` and pass it via `policy:` (or wrap the loop with `step()` — see below).

## Compaction on overflow

When a step returns `context-overflow`, the assistant message from that round-trip is *not* committed (it was generated against truncated input, so its quality is suspect). Supply a `compact` callback and the loop will retry after compaction; otherwise it stops with `stopReason: "context-overflow"`.

The callback owns the summarization strategy — call `agent.session.compact()` to mark the boundary, then `add()` the condensed history. The active chain resets to "post-compact only", and the pre-compact records stay in the DAG (visible via `session.history()` and `session.nodes`).

```ts
new Agent({
  // …
  contextLimit: model.options.limit.context,
  compact: async (agent) => {
    const summary = await summarize(agent.session.messages)
    agent.session.compact({ trigger: "auto", preTokens: agent.contextSize })
    agent.session.add({ role: "system", content: summary })
  },
})
```

## Sessions

`agent.session` is the conversation primitive. You can also build one directly and hand it to the agent — useful for resuming a persisted conversation or sharing one Session across multiple Agents (e.g. swapping models mid-conversation).

```ts
import { Session } from "@zaly/agent"

// Persistence is set on the Session itself; `start()` is called by the
// Agent's constructor (idempotent — no-op if the session is already
// started or was loaded from disk).
const session = new Session({ path: "./conversation.jsonl" })
const agent = new Agent({
  model,
  session,
  prompt: ["be concise"],         // recorded on the session-start node by start()
  messages: [{ role: "user", content: "hi" }],   // appended to the session
})
```

Key Session methods:

- `start({ modelId?, prompt? })` — write the `session-start` node. Idempotent: a no-op on a session that already has one (loaded, pre-seeded, or started by an earlier Agent). Historical metadata wins over later context.
- `add(message, meta?)` — append a message; `meta` carries `{ modelId, usage, finishReason }` for assistant turns.
- `compact({ trigger, preTokens? })` — mark a compaction boundary. `messages` resets; pre-compact nodes stay in `nodes` and `history()`.
- `navigate(uuid)` — set the head to any known node; rebuilds `messages` from its chain. The unified primitive for branch/rewind/replay (`navigate(undefined)` returns to root).
- `history(limit?)` — pre-active history (everything before the current chain's compacts), chronological, oldest-truncated when `limit` is set. For TUI scrollback that wants to render context the agent itself no longer sees.
- `Session.load(path, { fromUuid?, append? })` — rehydrate from a JSONL file, optionally checking out a specific node and toggling further appends.

Session events:

- `node` — fires on every commit (message / compact / session-start). The TUI's primary render hook.
- `navigate` — fires when `navigate()` swaps the head, with the new `messages` snapshot.

## Custom drivers

`step()` runs exactly one step and returns a `StepResult` (kind, message, toolMessage, finishReason, usage, error). The loop in `run()` is just `step()` plus the queue/policy checks; you can build your own driver if the built-in policy doesn't fit.

```ts
while (true) {
  const out = await agent.step()
  if (out.kind === "natural") break
  if (out.kind === "error") throw out.error
  // …custom interleaved logic…
}
```

## Status

Pre-0.1, in active development. Base tools, prompt assembly, and channel-adapter integration are landing next.

## License

[MIT](./LICENSE) © Folke Lemaitre
