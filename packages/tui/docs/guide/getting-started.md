# Getting started

`@zaly/tui` is a small direct-mode terminal UI toolkit built for agent interfaces. It renders whole rows to stdout, pins a sticky footer via `DECSTBM`, and streams content into the terminal's own scrollback — no virtual DOM, no repaints, no flicker.

## Install

::: code-group

```sh [bun]
bun add @zaly/tui
```

```sh [npm]
npm install @zaly/tui
```

```sh [pnpm]
pnpm add @zaly/tui
```

:::

## Hello, world

```ts
import { box, createRenderer, input, markdown, text } from "@zaly/tui"

const r = createRenderer()

r.ui.add(
  box(
    { bg: "bg", flexDirection: "column", padding: [0, 1] },
    text(({ style }) => style.dim("enter to send · ctrl-c to quit")),
    box(
      { flexDirection: "row", gap: 1 },
      text(({ style }) => style.primary("❯"), { width: 1 }),
      input({ placeholder: "type a message…" })
        .focus()
        .on("submit", (value, self) => {
          if (value.trim() === "") return
          r.stream.append(markdown(`**you:** ${value}`))
          self.setState({ cursor: 0, value: "" })
        })
    )
  )
)

r.start()
```

That's a full echo chat. The `stream` holds history (grows upward into scrollback), the `ui` footer is pinned at the bottom, and `ctrl-c` quits via the default `global.quit` binding.

## Three surfaces

Every renderer gives you three surfaces for different rendering needs:

| surface   | lives in             | scrolls | typical use              |
| --------- | -------------------- | ------- | ------------------------ |
| `stream`  | scroll region        | yes     | agent output, logs       |
| `ui`      | reserved bottom rows | no      | input, status, chrome    |
| `overlay` | absolute position    | no      | modals, tooltips, toasts |

See the [Surfaces](./surfaces) guide for the details.

## Reactivity in one snippet

Signals plus auto-tracking inside renders mean footer state updates with zero manual wiring:

```ts
import { signal, progress, spinner, text } from "@zaly/tui"

const [status, setStatus] = signal("ready")
const [busy, setBusy] = signal(false)
const [pct, setPct] = signal(0)

// Each node auto-subscribes to whatever it reads.
spinner({ running: busy })
progress({ value: pct, visible: busy })
text(({ style }) => style.success(status()))

// Later:
setBusy(true)
setStatus("thinking")
setPct(0.3)
```

See the [Reactivity](./reactivity) guide for `signal` / `memo` / `effect`.

## What's next

- [Architecture](./architecture) — why direct-mode, what the three surfaces actually do.
- [Nodes & state](./nodes) — how widgets compose and invalidate.
- [Input & actions](./input) — keymaps, actions, focus routing.
- [Theming](./theming) — slots, shiki integration, custom themes.
- [API reference](/api/) — every exported symbol, generated from source.
