# Zaly

Tooling for building terminal-native agent interfaces.

> [!WARNING]
> Pre-1.0 and in active development. Public shapes will move — pin carefully.

## Packages

| package                       | description                                                                                                                                               | docs                                 |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| [`@zaly/tui`](./packages/tui) | Direct-mode terminal UI toolkit — stream / footer / overlay surfaces, markdown + code + diff + image widgets, autocomplete with built-in sources, logger. | [tui.zaly.dev](https://tui.zaly.dev) |

## Working in this repo

Monorepo using Bun workspaces.

```sh
bun install
bun test
bun --filter @zaly/tui run docs:dev     # @zaly/tui docs site
bun packages/tui/demo/agent.ts          # run the agent demo
```

## License

[MIT](./LICENSE) © Folke Lemaitre
