# Autocomplete

Three completion sources wired to a single input:

- `/` → `actionsSource` — slash commands, backed by the renderer's action registry.
- `@` → `filesSource` — file paths from the current working directory, with drill-in navigation.
- `#` → `githubSource` — open issues and PRs via the `gh` CLI.

Registers a few app-level actions (`/clear`, `/greet`, `/model`, `/theme`, `/tokens`) so slash picks dispatch to something real.

Run with `bun demo/autocomplete.ts` — in a `gh`-authenticated repo to see issues/PRs.

::: code-group
<<< @/../demo/autocomplete.ts [demo/autocomplete.ts]
:::
