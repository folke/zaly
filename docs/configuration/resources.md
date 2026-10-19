# Resources and appearance

Resources customize zaly without changing the agent's implementation. They are
loaded from the user configuration directory, the project `.zaly/` directory,
and configured plugins/packs.

## Directory layout

```text
.zaly/
  config.json
  commands/
    review.md
  skills/
    review/
      SKILL.md
  plugins/
    hello.ts
  themes/
    my-theme.json
```

The same layout works under the user config directory, normally `~/.config/zaly/`.
Commands use top-level `*.md` files; skills are discovered recursively as `SKILL.md`;
local plugins use `*.ts`, `*.js`, or directory `index.ts`/`index.js`; themes use JSON.

Project resources have higher precedence than user resources. Configured workspace
resources, when supplied, sit between them. Skills are also discovered from project
`.agents/` directories and `~/.agents/`. Use `skills/SKILL.md` layouts within those
roots; this compatibility discovery is for skills, not every zaly resource type.

## Inspect and enable resources

Use `/resources` to select resources by scope or plugin and `/reload` to refresh
plugins and resources. Filters under `resources` can enable/disable a source or
include/exclude paths and resource categories. The [settings reference](../reference/settings.md)
contains the current filter schema.

For diagnostics, `zaly --print-config` includes resolved resource locations. To
start without a category, use `--no-skills`, `--no-commands`, `--no-themes`,
`--no-plugins`, or `--no-packs` as appropriate. Disabling plugins and disabling
resource packs are distinct controls.

## Themes

Run `/theme` for the interactive picker or `zaly --list-themes` to list bundled
themes. At startup, `--theme` accepts a bundled name or theme-file path; the
persistent setting is `ui.theme`.

Theme JSON can set `"appearance": "dark"` or `"appearance": "light"` to select the
corresponding default styles. When omitted, appearance is inferred from `bg`;
if no concrete background is available, the fallback is dark. The system theme
uses the detected terminal background or reported terminal appearance.

Other appearance controls include `ui.mode`, `ui.reasoning`, `ui.images`, and
`ui.collapsedTools`. Start with the defaults and adjust individual settings rather
than copying a full configuration snapshot. Inline graphics require a supported
[terminal](../guide/installation.md#terminal-support).

## Next steps

Create [instructions](../extend/instructions.md), [commands](../extend/commands.md),
[skills](../extend/skills.md), or [plugins/packs](../extend/plugins.md). Code and shell
snippets from resources execute locally; only enable content you trust.
