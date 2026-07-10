# @zaly/dev

Internal development tooling for the zaly monorepo.

`@zaly/dev` provides the `z` command used by package scripts for build, test,
lint, format, API extraction, and publishing tasks.

> [!NOTE]
> This package is private/internal and is not intended for end users.

## Usage

From the repository root:

```sh
bun z test
bun z lint
bun z fmt
bun z build
bun z api
```

From inside a package directory, `bun z ...` operates on that package where
supported.

## License

MIT © Folke Lemaitre
