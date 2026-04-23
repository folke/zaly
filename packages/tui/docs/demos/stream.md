# Streaming markdown

Simulates an agent streaming tokenized markdown responses into the stream surface. Each response is a `markdown()` node whose `content` grows token-by-token; the node re-renders on every mutation, so fenced blocks pick up syntax highlighting as they close.

Run with `bun demo/stream.ts`.

::: code-group
<<< @/../demo/stream.ts [demo/stream.ts]
:::
