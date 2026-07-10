# @zaly/cli

The `zaly` terminal app.

zaly is a terminal-native AI coding agent with a polished TUI, provider/model
configuration, sessions, permissions, tools, custom commands, skills, plugins,
selection/copy support, and terminal graphics.

> [!WARNING]
> Alpha software. zaly is already useful, but configuration, sessions, plugins,
> and behavior may change before 1.0.

## Install

```sh
bun add -g @zaly/cli
zaly
```

The published package provides the `zaly` executable.

## Highlights

- **Terminal-native UI** — fullscreen and scrollback modes, stream rendering,
  overlays, notifications, mouse support, selection, and clipboard integration.
- **Actions** — run app actions from the composer, with keybindings for common
  operations.
- **Agent runtime** — tool calling, permissions, long-running tasks, sessions,
  compaction, masking, and subagents via [`@zaly/agent`](../agent).
- **Providers** — model/provider/auth handling via [`@zaly/ai`](../ai).
- **Customization** — settings, commands, skills, packs, themes, and plugins via
  [`@zaly/config`](../config) and [`@zaly/plugin`](../plugin).
- **Terminal graphics** — Kitty Graphics Protocol support with capability
  detection and tmux passthrough where available.

## Basic usage

```sh
zaly              # start in the current directory
zaly --help       # show CLI flags
```

Inside zaly:

- Use the composer to talk to the agent.
- Use the action trigger to run app actions.
- Use `ctrl-y` to copy/yank the current selection or composer input.
- In fullscreen/mouse mode, selecting text can auto-copy to the clipboard when
  enabled.

## Configuration

zaly loads configuration through [`@zaly/config`](../config). The config surface
is still evolving during alpha; expect some names and defaults to change.

## Terminal notes

- Clipboard support depends on the local platform/terminal environment.
- Images require terminal graphics support. zaly prefers KGP unicode
  placeholders when available and falls back where possible.
- tmux support depends on terminal passthrough support and tmux configuration.

## License

MIT © Folke Lemaitre
