# Theming

> TODO: expand this page.

Themes are JSON files under `assets/themes/`. A `Theme` is a flat record of semantic slots — `primary`, `bg`, `fg`, `error`, `mdCode`, etc. — each resolving to a `Color` or `Style`.

```ts
import { loadTheme } from "@zaly/tui"
const theme = loadTheme("tokyonight-storm")
```

Bundled themes include the `tokyonight-*` family and a set derived from Shiki: `catppuccin-*`, `dracula`, `nord`, `github-*`, `gruvbox-*`, `one-dark-pro`, `rose-pine`.

## Shiki integration

Each theme JSON carries a `shiki` field naming the matching shiki theme for code-block highlighting. Widgets rendering code (`markdown`, `code`, `diff`) read `ctx.theme.shiki` at render time.

## Authoring a theme

Run `bun run build:typia` after schema changes. Theme JSON files are validated at load time; invalid slot values throw with a clear message.
