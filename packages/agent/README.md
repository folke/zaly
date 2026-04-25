# @zaly/agent

The zaly agent kernel: a stateless `runAgentTurn` primitive plus (soon) an interactive `Agent` session, built on top of [`@zaly/ai`](../ai). UI-agnostic — the same kernel runs the CLI, server, desktop, and channel adapters.

## Install

```sh
bun add @zaly/agent @zaly/ai
```

## Quickstart

```ts
import { Type } from "typebox"
import { defineTool, loadModel } from "@zaly/ai"
import { runAgentTurn } from "@zaly/agent"

const multiply = defineTool({
  name: "multiply",
  desc: "multiply two numbers",
  params: Type.Object({ a: Type.Number(), b: Type.Number() }),
  call: ({ a, b }) => a * b,
})

const model = await loadModel("openai/gpt-4o-mini")

const result = await runAgentTurn({
  provider: model.provider,
  request: {
    messages: [{ content: "What is 17 × 23?", role: "user" }],
    model: model.id,
    tools: [multiply],
  },
})

console.log(result.stopReason)        // "natural"
console.log(result.messages.at(-1))   // assistant final message
console.log(result.usage)             // summed token usage
```

## Stop reasons

`runAgentTurn` exposes a two-axis termination signal: the provider's `finishReason` (why the last round-trip stopped) and the loop's `stopReason`:

- `natural` — model returned without a tool call
- `max-iterations` — hit `maxIterations` (default 50)
- `token-budget` — `usage.input + usage.output` exceeded `tokenBudget`
- `loop-detected` — `loopDetector` flagged repetition
- `max-tool-errors` — too many consecutive failing tool calls
- `context-overflow` — request overflowed the context window (regex-detected from error messages or compared against `contextLimit`)
- `error` — a non-recoverable error; see `result.error`

## Loop detection

Cheap heuristics catching the common "model calls `read_file` with the same path 5 times" pattern:

```ts
import { createLoopDetector, runAgentTurn } from "@zaly/agent"

await runAgentTurn({
  // …
  loopDetector: createLoopDetector({
    consecutive: 3,     // same call N times in a row
    window: 10,         // …or appearing this often within a window
    windowRepeats: 4,
  }),
})
```

Returns a stateless `(calls: ToolCallPart[]) => boolean`. Swap it for any custom predicate.

## Caps and budgets

```ts
await runAgentTurn({
  // …
  maxIterations: 50,        // hard ceiling on provider round-trips
  maxToolErrors: 5,         // bail after N consecutive failing tool calls
  tokenBudget: 100_000,     // cumulative usage cap across the whole turn
  contextLimit: 128_000,    // model's context window for silent-overflow detection
})
```

## Status

Pre-0.1, in active development. The interactive `Agent` session, base tools, and prompt assembly are landing next.

## License

[MIT](./LICENSE) © Folke Lemaitre
