# Settings

Generated from the configuration schema and default settings. CLI overrides project settings, which override user settings and built-in defaults. See [configuration](../configuration/index.md).

Defaults for `system.npm` depend on the runtime: Bun under Bun, npm under Node. The `search` tool is additionally enabled when `BRAVE_API_KEY` is set.

<!-- settings:start -->
## `model`

**Type:** `string`

Default model to use for the agent.

## `reasoning`

**Type:** `"high" | "low" | "max" | "medium" | "minimal" | "off" | "xhigh"`

Default reasoning effort.

**Default:** `"medium"`

## `tools`

**Type:** `Array<string>`

**Default:** `["bash","edit","read","write","fetch","find","grep","task_list","task_poll","task_stop"]`

## `ui`

**Type:** `object`

## `ui.mode`

**Type:** `"fullscreen" | "scrollback"`

Terminal display mode. Scrollback preserves terminal history/search; fullscreen uses an alternate screen with a fixed footer.

**Default:** `"fullscreen"`

## `ui.copyOnSelect`

**Type:** `boolean`

**Default:** `true`

## `ui.collapsedTools`

**Type:** `Array<AnyTool>`

Tools whose result body should be hidden in the UI.

**Default:** `["read"]`

## `ui.images`

**Type:** `boolean`

Render images, if supported by the terminal

**Default:** `true`

## `ui.listHeight`

**Type:** `number`

Maximum number of visible rows in selection lists, like pickers and autocomplete.

**Default:** `10`

## `ui.reasoning`

**Type:** `boolean`

Whether to show the reasoning trace in the UI.

**Default:** `true`

## `ui.theme`

**Type:** `string`

Theme name or path to custom theme file

**Default:** `"tokyonight-moon"`

## `ui.sessionTree`

**Type:** `Array<"assistant" | "reasoning" | "system" | "tools">`

What messages to show in the session tree. Defaults to assistant, reasoning, and tools.

**Default:** `["assistant","reasoning","tools"]`

## `ui.transparent`

**Type:** `boolean`

Make the background transparent. Defaults to false.

**Default:** `false`

## `ui.treeHeight`

**Type:** `number`

Maximum number of visible rows in the session tree.

**Default:** `20`

## `skills`

**Type:** `object`

## `skills.enabled`

**Type:** `boolean`

Allow skills to be used by the agent. Defaults to true.

**Default:** `true`

## `skills.actions`

**Type:** `boolean`

Show skill actions. Defaults to true.

**Default:** `true`

## `skills.actionPrefix`

**Type:** `string`

Prefix for command actions. Defaults to `skill:`, e.g `/skill:SKILL_NAME`

**Default:** `"skill:"`

## `commands`

**Type:** `object`

Template commands.

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

## `compaction.enabled`

**Type:** `boolean`

Enable automatic compaction when context is full

**Default:** `true`

## `compaction.keepTokens`

**Type:** `number`

Existing messages up to this many tokens will be preserved in the context

**Default:** `20000`

## `compaction.reasoning`

**Type:** `"high" | "low" | "max" | "medium" | "minimal" | "off" | "xhigh"`

Reasoning effort for the compaction summary

**Default:** `"medium"`

## `compaction.summaryTokens`

**Type:** `number`

Maximum number of tokens to use for the generated summary

**Default:** `10000`

## `compaction.threshold`

**Type:** `number`

Threshold for automatic compaction.

**Default:** `0.95`

## `masking`

**Type:** `object`

## `masking.enabled`

**Type:** `boolean`

Whether to enable masking. Defaults to true.

**Default:** `true`

## `masking.minTokens`

**Type:** `number`

Don't mask tool-result parts whose original content is shorter
than this (estimated tokens). Skips tiny "ok"-style success
messages where the stub would be larger than the original.
Doesn't apply to attachments (always worth masking).

**Default:** `50`

## `masking.keepTurns`

**Type:** `number`

How many turns to keep in the tail of the conversation, regardless
of score. Defaults to 20.

**Default:** `40`

## `masking.delta`

**Type:** `number`

How far above the target ratio to trigger a new masking pass.
Defaults to 0.25 (25%).

**Default:** `0.25`

## `masking.target`

**Type:** `number`

Target ratio of used/limit tokens to reach by masking. Defaults to 0.5 (50%).

**Default:** `0.5`

## `permissions`

**Type:** `object`

## `permissions.preset`

**Type:** `"permissive" | "readonly" | "strict" | "yolo"`

Permissions preset to use. Defaults to "permissive".

**Default:** `"permissive"`

## `permissions.allow`

**Type:** `Array<string>`

## `permissions.deny`

**Type:** `Array<string>`

## `permissions.ask`

**Type:** `Array<string>`

## `plugins`

**Type:** `Array<string>`

## `resources`

**Type:** `object`

Resource configuration for zaly.

Values:

```json
{
  "type": "object",
  "properties": {
    "enabled": {
      "type": "boolean",
      "description": "Whether the plugin is enabled. Defaults to true."
    },
    "include": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "When set, only include the resources, matching these paths/globs from the plugin."
    },
    "exclude": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "When set, exclude the resources, matching these paths/globs from the plugin.\nAdd a resource type to the exclude list to disable that resource type. For example,\n`[\"skills\"]` will disable all skills from the plugin.\nExclude is applied after include."
    }
  },
  "required": [],
  "additionalProperties": false
}
```

## `system`

**Type:** `object`

System integrations and external commands used by zaly.

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

## `$schema`

**Type:** `string`

## `keymap`

**Type:** `object`

Values:

```json
{
  "oneOf": [
    {
      "type": "string"
    },
    {
      "type": "array",
      "items": {
        "type": "string"
      }
    }
  ]
}
```

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
