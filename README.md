# zaly

Hackable terminal coding agent.

> [!WARNING]
> zaly is alpha software. It is already useful and fairly polished, but APIs,
> configuration, session formats, and behavior may change. Expect rough edges.

Most users want the CLI app:

## Install zaly

```sh
bun add -g @zaly/cli
zaly
```

See [`@zaly/cli`](./packages/cli#readme) for the app README.

## Packages

| Package                                    | Description                                                                                                                   |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| [`@zaly/cli`](./packages/cli#readme)       | The `zaly` terminal app: composer, actions, sessions, providers, permissions, and TUI wiring.                                 |
| [`@zaly/agent`](./packages/agent#readme)   | Agent runtime: session loop, tools, permissions, compaction, masking, tasks, and subagents.                                   |
| [`@zaly/ai`](./packages/ai#readme)         | Provider/model abstraction: auth, streaming, content, tools, validation, and model metadata.                                  |
| [`@zaly/tui`](./packages/tui#readme)       | Terminal UI framework used by zaly: stream/UI/overlay surfaces, widgets, themes, selection, clipboard, and terminal graphics. |
| [`@zaly/config`](./packages/config#readme) | Settings, resources, packs, plugins, and configuration schemas.                                                               |
| [`@zaly/plugin`](./packages/plugin#readme) | Plugin-facing API and loader helpers.                                                                                         |
| [`@zaly/shared`](./packages/shared#readme) | Shared utilities for paths, processes, detection, images, ANSI text, templates, and more.                                     |
| [`@zaly/dev`](./packages/dev#readme)       | Internal development CLI for building, testing, linting, formatting, and publishing this monorepo.                            |

## Working in this repository

This is a Bun workspace monorepo.

```sh
bun install
bun test
bun z lint
bun z build
```

Useful development commands:

```sh
bun test packages/agent/test/permissions.test.ts
bun z test --coverage --reporter minimal
bun z fmt
```

## Status

zaly is pre-1.0 and in active development. Public package APIs are not frozen.

## License

[MIT](./LICENSE) © Folke Lemaitre
