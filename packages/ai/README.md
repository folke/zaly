# @zaly/ai

Provider/model abstraction used by zaly.

`@zaly/ai` contains model/provider loading, streaming helpers, auth management,
content conversion, tool definitions, schema validation, and model metadata.

> [!WARNING]
> Alpha package. Public APIs are not frozen.

## Install

```sh
bun add @zaly/ai typebox
```

Most users should install [`@zaly/cli`](../cli) instead.

## What it provides

- **Models and providers** — load model specs, provider adapters, overrides, and
  model metadata.
- **Auth** — API key and OAuth helpers for supported providers.
- **Streaming** — normalized stream events and collection helpers.
- **Tools** — `defineTool`, `runTool`, tool-call/result helpers, streaming tool
  support, and validation.
- **Content** — text, images, PDFs, attachments, errors, and provider-specific
  content formatting.
- **Validation** — TypeBox/JSON schema validation, coercion, and model-friendly
  error formatting.

## Minimal shape

```ts
import { Type } from "typebox"
import { defineTool, runTool } from "@zaly/ai"

const add = defineTool({
  name: "add",
  params: Type.Object({ a: Type.Number(), b: Type.Number() }),
  call: ({ a, b }) => a + b,
})

const result = await runTool(add, { a: 1, b: 2 })
```

For the multi-turn agent loop, see [`@zaly/agent`](../agent).

## License

MIT © Folke Lemaitre
