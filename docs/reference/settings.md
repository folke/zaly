# Settings

Generated from the configuration schema and default settings. CLI overrides project settings, which override user settings and built-in defaults. See [configuration](../configuration/index.md).

Defaults for `system.npm` depend on the runtime: Bun under Bun, npm under Node. The `search` tool is additionally enabled when `BRAVE_API_KEY` is set.

<!-- settings:start -->
## `$schema`

**Type:** `string`

## `commands`

**Type:** `object`

## `commands.actionPrefix`

**Type:** `string`

Prefix for command actions. Defaults to ``

**Default:** `""`

## `commands.bash`

**Type:** `boolean`

Allow bash execution in commands. Defaults to true.

**Default:** `true`

## `commands.expr`

**Type:** `boolean`

Allow js expressions in command templates. Defaults to true.

**Default:** `true`

## `compaction`

**Type:** `object`

## `compaction.backgroundEnabled`

**Type:** `boolean`

Start automatic compaction without pausing the foreground agent.

**Default:** `true`

## `compaction.backgroundThreshold`

**Type:** `number`

Context ratio at which background compaction starts.

**Default:** `0.9`

## `compaction.enabled`

**Type:** `boolean`

Enable automatic compaction when context is full

**Default:** `true`

## `compaction.keepTokens`

**Type:** `number`

Existing messages up to this many tokens will be preserved in the context

**Default:** `20000`

## `compaction.reasoning`

**Type:** `"off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max"`

Reasoning effort for the compaction summary

**Default:** `"medium"`

## `compaction.summaryTokens`

**Type:** `number`

Maximum number of tokens to use for the generated summary

**Default:** `10000`

## `compaction.threshold`

**Type:** `number`

Context ratio at which the agent waits for compaction before continuing.

**Default:** `0.95`

## `keymap`

**Type:** `object`

Values:

```json
{
  "anyOf": [
    {
      "type": "string"
    },
    {
      "items": {
        "type": "string"
      },
      "type": "array"
    }
  ]
}
```

## `masking`

**Type:** `object`

## `masking.delta`

**Type:** `number`

How far above the target ratio to trigger a new masking pass. Defaults to 0.25 (25%).

**Default:** `0.25`

## `masking.enabled`

**Type:** `boolean`

Whether to enable masking. Defaults to true.

**Default:** `true`

## `masking.keepTurns`

**Type:** `number`

How many turns to keep in the tail of the conversation, regardless of score. Defaults to 20.

**Default:** `40`

## `masking.minTokens`

**Type:** `number`

Don't mask tool-result parts whose original content is shorter than this (estimated tokens). Skips tiny "ok"-style success messages where the stub would be larger than the original. Doesn't apply to attachments (always worth masking).

**Default:** `50`

## `masking.target`

**Type:** `number`

Target ratio of used/limit tokens to reach by masking. Defaults to 0.5 (50%).

**Default:** `0.5`

## `model`

**Type:** `string`

Default model to use for the agent.

## `permissions`

**Type:** `object`

## `permissions.allow`

**Type:** `Array<string>`

## `permissions.ask`

**Type:** `Array<string>`

## `permissions.deny`

**Type:** `Array<string>`

## `permissions.preset`

**Type:** `"strict" | "readonly" | "permissive" | "yolo"`

Permissions preset to use. Defaults to "permissive".

**Default:** `"permissive"`

## `plugins`

**Type:** `Array<string>`

## `reasoning`

**Type:** `"off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max"`

Default reasoning effort.

**Default:** `"medium"`

## `resources`

**Type:** `object`

Resource configuration for zaly.

Values:

```json
{
  "additionalProperties": false,
  "properties": {
    "enabled": {
      "description": "Whether the plugin is enabled. Defaults to true.",
      "type": "boolean"
    },
    "exclude": {
      "description": "When set, exclude the resources, matching these paths/globs from the plugin. Add a resource type to the exclude list to disable that resource type. For example, `[\"skills\"]` will disable all skills from the plugin. Exclude is applied after include.",
      "items": {
        "type": "string"
      },
      "type": "array"
    },
    "include": {
      "description": "When set, only include the resources, matching these paths/globs from the plugin.",
      "items": {
        "type": "string"
      },
      "type": "array"
    }
  },
  "type": "object"
}
```

## `skills`

**Type:** `object`

## `skills.actionPrefix`

**Type:** `string`

Prefix for command actions. Defaults to `skill:`, e.g `/skill:SKILL_NAME`

**Default:** `"skill:"`

## `skills.actions`

**Type:** `boolean`

Show skill actions. Defaults to true.

**Default:** `true`

## `skills.enabled`

**Type:** `boolean`

Allow skills to be used by the agent. Defaults to true.

**Default:** `true`

## `system`

**Type:** `object`

## `system.bash`

**Type:** `Array<string>`

Command used by the bash tool.

**Default:** `["bash"]`

## `system.git`

**Type:** `Array<string>`

Command used for git packs.

**Default:** `["git"]`

## `system.npm`

**Type:** `Array<string>`

Package manager command used for npm packs.

**Default:** runtime-dependent

## `tools`

**Type:** `Array<string>`

**Default:** `["bash","edit","read","write","fetch","find","grep","task_list","task_poll","task_stop"]`

## `ui`

**Type:** `object`

## `ui.collapsedTools`

**Type:** `Array<"agent_send" | "agent_spawn" | "bash" | "edit" | "fetch" | "find" | "grep" | "read" | "search" | "subagent" | "task_list" | "task_poll" | "task_stop" | "wakeup" | "write" | string>`

Tools whose result body should be hidden in the UI.

**Default:** `["read"]`

## `ui.copyOnSelect`

**Type:** `boolean`

**Default:** `true`

## `ui.images`

**Type:** `boolean`

Render images, if supported by the terminal

**Default:** `true`

## `ui.listHeight`

**Type:** `number`

Maximum number of visible rows in selection lists, like pickers and autocomplete.

**Default:** `10`

## `ui.mode`

**Type:** `"scrollback" | "fullscreen"`

Terminal display mode. Scrollback preserves terminal history/search; fullscreen uses an alternate screen with a fixed footer.

**Default:** `"fullscreen"`

## `ui.reasoning`

**Type:** `boolean`

Whether to show the reasoning trace in the UI.

**Default:** `true`

## `ui.sessionTree`

**Type:** `Array<"assistant" | "reasoning" | "tools" | "system">`

What messages to show in the session tree. Defaults to assistant, reasoning, and tools.

**Default:** `["assistant","reasoning","tools"]`

## `ui.shiki`

**Type:** `"auto" | "andromeeda" | "aurora-x" | "ayu-dark" | "ayu-light" | "ayu-mirage" | "catppuccin-frappe" | "catppuccin-latte" | "catppuccin-macchiato" | "catppuccin-mocha" | "dark-plus" | "dracula" | "dracula-soft" | "everforest-dark" | "everforest-light" | "github-dark" | "github-dark-default" | "github-dark-dimmed" | "github-dark-high-contrast" | "github-light" | "github-light-default" | "github-light-high-contrast" | "gruvbox-dark-hard" | "gruvbox-dark-medium" | "gruvbox-dark-soft" | "gruvbox-light-hard" | "gruvbox-light-medium" | "gruvbox-light-soft" | "horizon" | "horizon-bright" | "houston" | "kanagawa-dragon" | "kanagawa-lotus" | "kanagawa-wave" | "laserwave" | "light-plus" | "material-theme" | "material-theme-darker" | "material-theme-lighter" | "material-theme-ocean" | "material-theme-palenight" | "min-dark" | "min-light" | "monokai" | "night-owl" | "night-owl-light" | "nord" | "one-dark-pro" | "one-light" | "plastic" | "poimandres" | "red" | "rose-pine" | "rose-pine-dawn" | "rose-pine-moon" | "slack-dark" | "slack-ochin" | "snazzy-light" | "solarized-dark" | "solarized-light" | "synthwave-84" | "tokyo-night" | "vesper" | "vitesse-black" | "vitesse-dark" | "vitesse-light"`

Syntax highlighting: auto uses the theme's Shiki counterpart or generates from its syntax slots; a bundled name overrides it.

**Default:** `"auto"`

## `ui.theme`

**Type:** `string`

Theme name or path to custom theme file

**Default:** `"tokyonight-moon"`

## `ui.transparent`

**Type:** `boolean`

Make the background transparent. Defaults to false.

**Default:** `false`

## `ui.treeHeight`

**Type:** `number`

Maximum number of visible rows in the session tree.

**Default:** `20`

## Permission presets

### strict

Ask for everything. No commands or file ops auto-allowed.


```json
{
  "deny": [
    "bash(sudo:*)"
  ],
  "ask": [
    "tool(*)",
    "read(*)",
    "write(*)"
  ]
}
```

### readonly

Auto-allow read-only utilities, git read-only ops, and common build/test commands. Reads inside the workspace are allowed (sensitive paths denied); writes always ask.


```json
{
  "deny": [
    "bash(sudo:*)"
  ],
  "allow": [
    "tool(read)",
    "tool(grep)",
    "tool(find)",
    "tool(task_list)",
    "tool(task_poll)",
    "bash(ls:*)",
    "bash(cat:*)",
    "bash(head:*)",
    "bash(tail:*)",
    "bash(wc:*)",
    "bash(find:*)",
    "bash(grep:*)",
    "bash(rg:*)",
    "bash(fd:*)",
    "bash(sort:*)",
    "bash(uniq:*)",
    "bash(cut:*)",
    "bash(diff:*)",
    "bash(stat:*)",
    "bash(file:*)",
    "bash(realpath:*)",
    "bash(readlink:*)",
    "bash(basename:*)",
    "bash(dirname:*)",
    "bash(echo:*)",
    "bash(printf:*)",
    "bash(sed:*)",
    "bash(awk:*)",
    "bash(xxd:*)",
    "bash(hexdump:*)",
    "bash(od:*)",
    "bash(tree:*)",
    "bash(pwd)",
    "bash(true)",
    "bash(false)",
    "bash(which:*)",
    "bash(type:*)",
    "bash(command:*)",
    "bash(test:*)",
    "bash(cd:*)",
    "bash(git status:*)",
    "bash(git log:*)",
    "bash(git diff:*)",
    "bash(git show:*)",
    "bash(git show-ref:*)",
    "bash(git branch:*)",
    "bash(git remote:*)",
    "bash(git rev-parse:*)",
    "bash(git config --get:*)",
    "bash(gh issue list:*)",
    "bash(gh issue view:*)",
    "bash(gh pr list:*)",
    "bash(gh pr view:*)",
    "bash(gh repo view:*)",
    "bash(bun test:*)",
    "bash(bun test:node:*)",
    "bash(bun test:bun:*)",
    "bash(bun check:*)",
    "bash(bun run:*)",
    "bash(bun build:*)",
    "bash(bunx tsc:*)",
    "bash(bun tsc:*)",
    "bash(bun x tsc:*)",
    "bash(bunx vitest:*)",
    "bash(bun x vitest:*)",
    "bash(bunx oxlint:*)",
    "bash(bun x oxlint:*)",
    "bash(oxlint:*)"
  ],
  "ask": [
    "tool(*)",
    "write(*)"
  ]
}
```

### permissive

Readonly preset plus broader dev commands (file moves, ad-hoc bun/node evals, git mutations, network fetches) and writes inside the workspace.


```json
{
  "deny": [
    "bash(sudo:*)"
  ],
  "allow": [
    "tool(*)",
    "bash(ls:*)",
    "bash(cat:*)",
    "bash(head:*)",
    "bash(tail:*)",
    "bash(wc:*)",
    "bash(find:*)",
    "bash(grep:*)",
    "bash(rg:*)",
    "bash(fd:*)",
    "bash(sort:*)",
    "bash(uniq:*)",
    "bash(cut:*)",
    "bash(diff:*)",
    "bash(stat:*)",
    "bash(file:*)",
    "bash(realpath:*)",
    "bash(readlink:*)",
    "bash(basename:*)",
    "bash(dirname:*)",
    "bash(echo:*)",
    "bash(printf:*)",
    "bash(sed:*)",
    "bash(awk:*)",
    "bash(xxd:*)",
    "bash(hexdump:*)",
    "bash(od:*)",
    "bash(tree:*)",
    "bash(pwd)",
    "bash(true)",
    "bash(false)",
    "bash(which:*)",
    "bash(type:*)",
    "bash(command:*)",
    "bash(test:*)",
    "bash(cd:*)",
    "bash(git status:*)",
    "bash(git log:*)",
    "bash(git diff:*)",
    "bash(git show:*)",
    "bash(git show-ref:*)",
    "bash(git branch:*)",
    "bash(git remote:*)",
    "bash(git rev-parse:*)",
    "bash(git config --get:*)",
    "bash(gh issue list:*)",
    "bash(gh issue view:*)",
    "bash(gh pr list:*)",
    "bash(gh pr view:*)",
    "bash(gh repo view:*)",
    "bash(bun test:*)",
    "bash(bun test:node:*)",
    "bash(bun test:bun:*)",
    "bash(bun check:*)",
    "bash(bun run:*)",
    "bash(bun build:*)",
    "bash(bunx tsc:*)",
    "bash(bun tsc:*)",
    "bash(bun x tsc:*)",
    "bash(bunx vitest:*)",
    "bash(bun x vitest:*)",
    "bash(bunx oxlint:*)",
    "bash(bun x oxlint:*)",
    "bash(oxlint:*)",
    "bash(bun -e:*)",
    "bash(bun:*)",
    "bash(node:*)",
    "bash(node -e:*)",
    "bash(make:*)",
    "bash(mkdir:*)",
    "bash(cp:*)",
    "bash(mv:*)",
    "bash(touch:*)",
    "bash(ln:*)",
    "bash(chmod:*)",
    "bash(git add:*)",
    "bash(git commit:*)",
    "bash(git checkout:*)",
    "bash(git restore:*)",
    "bash(git stash:*)",
    "bash(git fetch:*)",
    "bash(git pull:*)",
    "bash(curl:*)",
    "bash(jq:*)",
    "bash(perl -e:*)",
    "bash(timeout:*)",
    "bash(for:*)",
    "bash(while:*)",
    "write(*)"
  ]
}
```

### yolo

Allow everything. No prompts. Use only when you trust the model and the task.


```json
{
  "allow": [
    "bash",
    "read(*)",
    "write(*)",
    "tool(*)"
  ]
}
```
<!-- settings:end -->
