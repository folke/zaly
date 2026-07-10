# @zaly/config

Configuration, resources, and package metadata for zaly.

`@zaly/config` loads and merges settings, discovers resources, handles resource
packs/plugins, and exposes schemas used by the CLI and agent runtime.

> [!WARNING]
> Alpha package. Public APIs and config shape are still evolving.

## Install

```sh
bun add @zaly/config
```

Most users should install [`@zaly/cli`](../cli) instead.

## What it provides

- **Settings** — typed settings loading, merging, defaults, and schema assets.
- **Resources** — discovery for commands, skills, themes, providers, models, and
  other zaly resources.
- **Packs/plugins** — package metadata, URI parsing, install/update helpers, and
  resource manager plumbing.
- **State** — user/project state helpers used by the CLI.

## Status

The project trust/enabled-resource model is still being designed. Expect config
and resource behavior to change during alpha.

## License

MIT © Folke Lemaitre
