# Architecture

> TODO: expand this page.

`@zaly/tui` is a direct-mode TUI. The renderer owns a writer (stdout) and three surfaces. Each surface paints whole rows per tick, wrapped in a `CSI ? 2026` synchronized-output bracket so the display never catches a half-drawn frame.

- **stream** — content is appended as rows at the `scrollBottom` cursor, which pushes older rows into terminal scrollback naturally.
- **ui** — reserved rows at the bottom, pinned by `DECSTBM`. Reflows on resize.
- **overlay** — absolute-positioned; painted after the other two, rows it covers are marked stale so the stream rewrites them before the next scroll.

See the [Surfaces](./surfaces) guide for operational details.
