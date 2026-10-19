# Configuration

zaly combines built-in defaults, user configuration, project configuration, and
CLI overrides. Higher priority wins:

1. CLI overrides.
2. Project `config.json`.
3. User `config.json`.
4. Built-in defaults.

Resources have their own discovery/precedence rules; see [resources](./resources.md).
Do not assume that every array or resource list concatenates across scopes.

## Configuration files

On Linux and macOS, the default user configuration is:

```text
~/.config/zaly/config.json
```

The project configuration is `config.json` in the project's `.zaly/` directory.
zaly searches upward for the closest `.zaly/`, stopping at the Git root (or the
home-directory boundary outside a Git checkout). When none exists, the default
location is the Git root's `.zaly/config.json`, or the working directory's outside Git.

Use `/config --user` or `/config --project` to edit the intended scope. Paths can
be overridden with XDG and `ZALY_*` variables; see [paths](../reference/paths.md).

## Minimal example

```json
{
  "reasoning": "medium",
  "permissions": { "preset": "readonly" },
  "ui": {
    "theme": "tokyonight-moon",
    "collapsedTools": ["read"],
    "images": true
  }
}
```

Set `model` to a provider/model ID selected from `/model` when you want an explicit
default. Otherwise startup can reuse the resumed session's model or saved selection.

## Syntax highlighting

`ui.shiki` selects syntax highlighting independently of the UI theme:

- `"auto"` (default): use the active theme's Shiki counterpart, or generate highlighting
  from its syntax slots when none is specified. The system theme uses generated highlighting.
- A bundled Shiki theme name, such as `"github-dark"` or `"tokyo-night"`: use that theme
  regardless of the UI theme.

Generated highlighting preserves terminal ANSI colors when RGB palette detection is unavailable.

## Verify the result

```sh
zaly --print-config
```

This is more reliable than inspecting a single file when a project, CLI flag, or
resource filter may override it. Use `/reload` or restart after manual changes.

The [generated settings reference](../reference/settings.md) lists types and
current defaults. Authentication lives separately from ordinary settings:
never commit credential files or put secrets in project configuration.
