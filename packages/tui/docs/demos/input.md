# Chat composer

Minimal echo chat. Typed messages are appended to the stream; `ctrl-v` pastes text inline or attaches pasted images / files via the `attach` event (images land as `image()` nodes, file references as markdown links). Demonstrates the full paste-handling flow wired through to the stream.

Run with `bun demo/input.ts`.

::: code-group
<<< @/../demo/input.ts [demo/input.ts]
:::
