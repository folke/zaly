# @zaly/tui

Direct-mode terminal UI toolkit for building agent interfaces.

Renders whole rows straight to stdout — no virtual buffer, no per-cell diff. The terminal's own scrollback keeps history; a sticky footer holds the composer; overlays float on top. ANSI, markdown, syntax-highlighted code, diffs, and inline images all come in the box.

> [!TIP]
> Full docs, live previews, and the complete API reference: **[tui.zaly.dev](https://tui.zaly.dev)**.

## Install

```sh
bun add @zaly/tui    # also works with npm / pnpm / yarn
```

## Hello world

```ts
import { box, createRenderer, input, markdown, text } from "@zaly/tui"

const r = createRenderer()

r.ui.add(
  box({ padding: [0, 1] },
    text(({ style }) => style.dim("enter to send · ctrl-c to quit")),
    input({ placeholder: "say something…" })
      .focus()
      .on("submit", (value, self) => {
        r.stream.append(markdown(`**you:** ${value}`))
        self.setState({ cursor: 0, value: "" })
      }),
  ),
)

r.start()
```

## Highlights

- **Three surfaces** — stream (scroll region), UI (pinned footer via DECSTBM), overlay (absolute-positioned floats).
- **Widgets** — text, box, markdown, code (shiki), diff, image (Kitty + iTerm2), input, menu, progress, spinner, overlay, autocomplete, log.
- **Autocomplete sources** — slash commands (via action registry), file paths, GitHub issues / PRs via `gh`. Plug your own.
- **Logger** — `renderer.log("...")` / `log.error(...)` with `util.format`, markdown bodies, optional `console.*` interception.
- **Signals + fine-grained reactivity** — mutate `node.state.x = y` or a signal, only the affected node re-renders.
- **Themes** — `tokyonight-*`, `catppuccin-*`, `dracula`, `nord`, `github-*`, `gruvbox-dark-medium`, `one-dark-pro`, `rose-pine`. Shiki-integrated.
- **Bun + Node** — runtime split via import map; one API.

## Demos

```sh
bun demo/agent.ts          # full agent harness
bun demo/autocomplete.ts   # actions + files + github completion
bun demo/stream.ts         # streaming markdown
bun demo/logger.ts         # every log level + console interception
```

## Status

> [!WARNING]
> Pre-1.0. The public API is stabilizing but not frozen — some shapes will still move as `@zaly/tui` is driven by what the rest of the Zaly stack needs.

## License

[MIT](./LICENSE) © Folke Lemaitre
