# @zaly/agent

Agent runtime used by zaly.

`@zaly/agent` owns the conversation/session loop, tool execution, permissions,
long-running task tracking, compaction, masking, skills, and subagents. It is UI
agnostic and is used by [`@zaly/cli`](../cli).

> [!WARNING]
> Alpha package. Public APIs are not frozen.

## Install

```sh
bun add @zaly/agent @zaly/ai typebox
```

Most users should install [`@zaly/cli`](../cli) instead.

## What it provides

- **Agent loop** — streams model output, dispatches tool calls, resumes after
  tool results, and stops on clear stop reasons.
- **Sessions** — JSONL-backed conversation/session storage with compaction and
  navigation support.
- **Tools** — built-in tool runtime, permissions, preflight checks, long-running
  task registry, and task polling/abort support.
- **Context management** — token scoring, compaction, masking, and recent-turn
  preservation for long sessions.
- **Skills and subagents** — reusable instructions and delegated agent runs.

## Minimal shape

```ts
import { createAgent } from "@zaly/agent"

const agent = await createAgent({
  model,
  tools,
})

agent.send({ role: "user", content: "Help me fix the tests" })
await agent.run()
```

For provider/model loading and tool definitions, see [`@zaly/ai`](../ai).

## License

MIT © Folke Lemaitre
