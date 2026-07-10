# @zaly/shared

Shared utilities used across zaly packages.

`@zaly/shared` contains small runtime helpers for paths, processes, text/ANSI,
file detection, images, templates, JSON, shell quoting, logging, collections,
and other cross-package plumbing.

> [!WARNING]
> Alpha package. Public APIs are not frozen.

## Install

```sh
bun add @zaly/shared
```

Most users should install [`@zaly/cli`](../cli) instead.

## Common areas

- **Process helpers** — spawn/system wrappers and stream handling.
- **Text and ANSI** — width, slicing, stripping, wrapping, ANSI-aware helpers.
- **Detection** — file, text, image, and PDF detection utilities.
- **Images** — image info/conversion helpers.
- **Templates** — small VM-backed template renderer used by zaly commands.
- **Filesystem** — path, glob, find, JSON, and atomic write utilities.

## License

MIT © Folke Lemaitre
