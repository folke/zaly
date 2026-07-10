# @zaly/tui

Terminal UI framework used by zaly.

`@zaly/tui` is a direct-mode terminal renderer with stream, UI, and overlay
surfaces; reactive widgets; markdown/code/diff rendering; mouse selection;
clipboard helpers; themes; and terminal graphics support.

> [!WARNING]
> Alpha package. Public APIs are not frozen.

## Install

```sh
bun add @zaly/tui
```

Most users should install [`@zaly/cli`](../cli) instead.

## Highlights

- **Renderer surfaces** — scrollable stream, pinned UI/footer, and overlay layer.
- **Widgets** — text, box, markdown, code, diff, image, input, select/tree,
  picker, progress, spinner, log, and autocomplete building blocks.
- **Selection** — mouse selection in fullscreen mode, copy-friendly text
  extraction, word/line selection, and app-level selection events.
- **Terminal graphics** — Kitty Graphics Protocol support with capability
  detection, unicode placeholders where supported, direct placement fallback,
  and tmux passthrough handling.
- **Themes** — ANSI/style builder, theme registry, and syntax highlighting
  integration.
- **Runtime split** — works in Bun and Node through package exports/import maps.

## Minimal example

```ts
import { createRenderer, input, markdown } from "@zaly/tui"

const renderer = await createRenderer()

renderer.stream.append(markdown("# hello from zaly/tui"))
renderer.ui.add(
  input({ placeholder: "say something…" }).on("submit", (value, self) => {
    renderer.stream.append(markdown(`**you:** ${value}`))
    self.setState({ cursor: 0, value: "" })
  })
)

renderer.start()
```

## Notes

This package is built for zaly first. It is usable on its own, but API names and
widget behavior may change while the app evolves.

## License

MIT © Folke Lemaitre
