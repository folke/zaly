# zaly

Hackable terminal coding agent.

zaly is an AI coding agent with a polished terminal UI, persistent sessions,
flexible model support, explicit permissions, and a resource system built to be
extended.

> [!WARNING]
> zaly is alpha software. It is already useful and fairly polished, but APIs,
> configuration, session formats, and behavior may change before 1.0. Expect
> rough edges.

## ✨ Features

- **Fast by design** — startup and session resume stay fast, even with very large
  histories. Lazy modules, chunked JSONL reads from the end, incremental loading,
  and progressive widget rendering keep work off the path to first render.
- **A terminal UI built for agent work** — use a focused fullscreen interface or
  keep native terminal scrollback. Streaming Markdown, syntax highlighting,
  overlays, mouse support, selection, clipboard integration, themes, and
  terminal images are built in.
- **Choose the right model per task** — authenticate with multiple providers,
  browse available models, switch models mid-session, and tune reasoning effort
  without restarting zaly.
- **Sessions that can keep going** — sessions persist and resume per workspace.
  Inspect the exact context sent to the model, browse the message tree, compact
  old history, and let automatic masking keep large tool results under control.
- **Built for both sides of the conversation** — zaly keeps the agent aware of
  session resumes, time, compaction, context pressure, model changes, completed
  tasks, and other runtime events. Important harness state becomes context
  instead of remaining invisible.
- **Tools without blocking the conversation** — long-running tools become
  managed background tasks. Stop a turn, inspect task progress, and keep working
  without losing the session.
- **Explicit permissions** — choose `strict`, `readonly`, `permissive`, or `yolo`,
  then refine behavior with per-tool allow, ask, and deny rules.
- **Hackable by design** — add commands, reusable skills, resource packs, themes,
  and TypeScript plugins at user or project scope. Reload resources without
  restarting the app.

## 📋 Requirements

- [Node.js](https://nodejs.org/) **22.11 or newer**
- Access to at least one supported model provider; credentials where required
- A modern terminal; mouse, clipboard, and terminal graphics support are
  optional

## 🚀 Install

With npm:

```sh
npm install -g @zaly/cli
```

Or with Bun:

```sh
bun add -g @zaly/cli
```

## ⚡ Quick start

```sh
cd your-project
zaly --yolo
```

Start typing to talk to the agent. zaly persists sessions and resumes the most
recent session for the workspace unless you start a new one.

Useful first actions:

- `/login` authenticates with a model provider.
- `/model` browses and switches models.
- `/help` shows all available actions and keybindings.

## 🔐 Permissions

For now, we recommend the **`yolo` preset** for the smoothest experience with
capable models. It allows every tool call without prompting, including shell
commands and file writes. Only use it with models, tasks, and projects you
trust.

Enable it for one invocation:

```sh
zaly --yolo
```

To make it persistent, run `/config` and add:

```json
{
  "permissions": {
    "preset": "yolo"
  }
}
```

The other presets—`strict`, `readonly`, and `permissive`—provide progressively
broader defaults and can be refined with explicit allow, ask, and deny rules.

## ⌨️ Essential actions

Type `/` in the composer to discover actions and commands. `/help` shows the
complete list together with active keybindings.

| Action or key        | What it does                                             |
| -------------------- | -------------------------------------------------------- |
| `/help`, `Ctrl-H`    | Show actions and keyboard shortcuts                      |
| `/login`             | Authenticate with a model provider                       |
| `/model`             | Browse or switch the model used for future turns         |
| `/effort`            | Change the model's reasoning effort                      |
| `/context`           | Inspect the context currently sent to the model          |
| `/tree`              | Browse the current session's message tree                |
| `/new`               | Start a new session in the current workspace             |
| `/resume`            | Find and resume another session                          |
| `/compact`           | Summarize older history while preserving recent messages |
| `/config`            | Edit user or project configuration                       |
| `/resources`         | Enable or disable resources for the workspace            |
| `/plugins`           | Manage installed plugins                                 |
| `/theme`             | Choose a color theme for the current session             |
| `/stop`, `Esc`       | Stop the current agent turn or running tool batch        |
| `Ctrl-Y`             | Copy the selection or composer input                     |
| `/history`, `Ctrl-R` | Browse and reuse previous composer input                 |

## 🧩 Customization

zaly can load resources from both user and project configuration:

- **Commands** turn reusable shell or template workflows into composer actions.
- **Skills** provide reusable instructions and supporting files that the agent
  can activate when needed.
- **Resource packs** bundle commands, skills, themes, settings, and plugins.
- **Themes** customize both the TUI and syntax highlighting.
- **TypeScript plugins** can extend tools, hooks, model behavior, and the app
  through [`@zaly/plugin`](./packages/plugin#readme).

Use `/config` to edit configuration, `/resources` to choose which resources are
enabled, and `/reload` to reload plugins and resources without restarting zaly.
These formats are still evolving during alpha.

## 🖥️ Terminal notes

- **Fullscreen mode** provides a focused app-like interface. **Scrollback mode**
  renders into native terminal history. Configure the mode with `/config`.
- Clipboard support depends on the platform and terminal environment. `Ctrl-Y`
  copies the active selection or composer input.
- Images use the Kitty Graphics Protocol when supported and degrade gracefully
  when terminal graphics are unavailable.
- tmux graphics support depends on terminal passthrough and tmux configuration.

## 📦 Packages

| Package                                    | Description                                                                                                      |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| [`@zaly/cli`](./packages/cli#readme)       | The `zaly` terminal app: composer, actions, sessions, providers, permissions, and TUI wiring.                    |
| [`@zaly/agent`](./packages/agent#readme)   | Agent runtime: session loop, tools, permissions, compaction, masking, tasks, and subagents.                      |
| [`@zaly/ai`](./packages/ai#readme)         | Provider/model abstraction: auth, streaming, content, tools, validation, and model metadata.                     |
| [`@zaly/tui`](./packages/tui#readme)       | Terminal UI framework: stream/UI/overlay surfaces, widgets, themes, selection, clipboard, and terminal graphics. |
| [`@zaly/config`](./packages/config#readme) | Settings, resources, packs, plugins, and configuration schemas.                                                  |
| [`@zaly/plugin`](./packages/plugin#readme) | Plugin-facing API and loader helpers.                                                                            |
| [`@zaly/shared`](./packages/shared#readme) | Shared utilities for paths, processes, detection, images, ANSI text, templates, and more.                        |
| [`@zaly/dev`](./packages/dev#readme)       | Internal development CLI for building, testing, linting, formatting, and publishing this monorepo.               |

## 🛠️ Development

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
