# @zaly/plugin

Plugin-facing API and loader helpers for zaly.

`@zaly/plugin` provides the runtime API surface exposed to plugins and helpers to
load/dispose plugin modules.

> [!WARNING]
> Alpha package. The plugin API is not frozen.

## Install

```sh
bun add @zaly/plugin
```

Most users should install [`@zaly/cli`](../cli) instead.

## What it provides

- **Plugin loader** — load plugin modules and dispose registered cleanups.
- **Plugin API** — typed access to agent actions, model helpers, prompts, tools,
  UI helpers, events, and cleanup registration.
- **Host boundary** — a small interface between user plugins and the zaly app.

## Minimal shape

```ts
import type { PluginApi } from "@zaly/plugin"

export default function plugin(zaly: PluginApi) {
  zaly.events.on("agent:start", () => {
    // plugin logic
  })
}
```

Exact plugin capabilities may change during alpha.

## License

MIT © Folke Lemaitre
