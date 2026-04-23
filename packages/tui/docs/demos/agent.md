# Agent harness

A compact coding-assistant shell exercising most of the toolkit in one place:

- **Stream surface** for conversation history.
- **Sticky footer** with status, progress, spinner, autocomplete, and composer.
- **Actions registry** — `/plan`, `/review`, `/ship`, `/help`, `/clear` are real actions, picked up automatically by `actionsSource` and bindable to keys (`ctrl-h` opens the help overlay).
- **Overlays** — a help panel auto-built from the action catalog, and a welcome toast that auto-dismisses on start.
- **Signals** driving the footer state so replies stream token-by-token while the spinner / progress / status stay in sync.

Use it as the starting point when building your own agent UI on top of `@zaly/tui`.

Run with `bun demo/agent.ts`.

::: code-group
<<< @/../demo/agent.ts [demo/agent.ts]
:::
