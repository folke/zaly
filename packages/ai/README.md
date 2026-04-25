# @zaly/ai

Headless multi-provider LLM transport with tool primitives, lenient JSON validation, and a baked models.dev catalog. Streaming-first, provider-agnostic, and useful with or without the rest of zaly.

## Install

```sh
bun add @zaly/ai
```

## Quickstart

Load a model, define a typed tool, run a turn, dispatch any tool calls the model emits.

```ts
import { Type } from "typebox"
import { collect, defineTool, loadModel, runTool } from "@zaly/ai"
import type { Message, ToolCallPart } from "@zaly/ai"

const multiply = defineTool({
  name: "multiply",
  desc: "multiply two numbers",
  params: Type.Object({ a: Type.Number(), b: Type.Number() }),
  call: ({ a, b }) => a * b,
})

const model = await loadModel(process.env.MODEL ?? "openai/gpt-4o-mini")

const messages: Message[] = [{ content: "What is 17 × 23?", role: "user" }]

for (;;) {
  const { message } = await collect(model.stream({ messages, tools: [multiply] }))
  messages.push(message)

  const calls = (Array.isArray(message.content) ? message.content : []).filter(
    (p): p is ToolCallPart => p.type === "tool-call",
  )
  if (calls.length === 0) break

  const results = await Promise.all(
    calls.map(async (c) => {
      const r = await runTool(multiply, c.params)
      return { id: c.id, isError: r.isError, name: c.name, result: r.result, type: "tool-result" as const }
    }),
  )
  messages.push({ content: results, role: "tool" })
}

console.log(messages.at(-1))
```

## What's inside

- **Provider transport** — `loadModel`, `provider.stream`, SSE parsing, prompt-cache awareness, per-model wire quirks (reasoning effort, thinking format, max-tokens field).
- **Tool primitives** — `defineTool` (TypeBox schemas), `runTool` (parse → coerce → validate → call), `ToolError` with stable `code`, `data`, `retryable` fields.
- **JSON utilities** — `parseJson` (jsonrepair-backed: handles markdown fences, smart quotes, truncation, prose envelopes), `validate`, `coerce`, and `stringifyErrors` — an annotator that produces JSONC with inline `// ❌` comments at every error path. Feeding validation failures back to the model in this form materially improves recovery.
- **Models catalog** — `listModels`, `getModel` reading a baked snapshot of [models.dev](https://models.dev), with per-model adapter quirks pre-resolved.

## What's not inside

The agent loop, session management, base prompts, and primitive tools live in [`@zaly/agent`](../agent). For a production-ready multi-turn loop with stop reasons, loop detection, token budgets, and steering, use that.

## Status

Pre-0.1, in active development. APIs may change.

## License

[MIT](./LICENSE) © Folke Lemaitre
