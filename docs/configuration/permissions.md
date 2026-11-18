# Permissions

Permissions decide whether tool operations are allowed, denied, or need your
approval. They are separate from the set of enabled tools and from instructions
such as “don't edit files.” Review the actual request before approving it.

## Presets

Select a preset in configuration or for one invocation:

```sh
zaly --permission readonly
```

| Preset       | Intended behavior                                                          |
| ------------ | -------------------------------------------------------------------------- |
| `strict`     | Ask for tool/file operations rather than broadly auto-allowing them.       |
| `readonly`   | Allow common inspection and development commands; writes require approval. |
| `permissive` | Default: broader development commands and workspace writes are allowed.    |
| `yolo`       | Allow everything without prompts.                                          |

`readonly` is **not a filesystem sandbox**: commands, tests, and build scripts can
have side effects. `permissive` is a convenience trade-off, not a promise that
all operations are harmless. Sensitive paths and workspace boundaries have
additional handling outside the ordinary allow lists.

::: danger Yolo
`zaly --yolo` removes approval gates. It does not make model-selected commands safe,
and stopping the agent does not undo side effects. Avoid it in untrusted projects
or environments containing credentials you cannot afford to expose.
:::

## Rules

```json
{
  "permissions": {
    "preset": "readonly",
    "allow": ["bash(git status:*)"],
    "ask": ["write(*)"],
    "deny": ["bash(sudo:*)"]
  }
}
```

Rules address scopes such as `tool(read)`, `bash(git status:*)`, `read(*)`, and
`write(*)`. File patterns, command matching, and handler-specific checks are not
interchangeable. A rule permitting a tool does not necessarily bypass all its
file/command checks.

Use the [generated settings reference](../reference/settings.md#permission-presets)
for exact preset descriptions and current rule lists. Start with a preset rather
than copying a large allow list that will become stale.

## Project code and extensions

Plugins and command-template shell snippets run code locally. Install or enable
only resources you trust; agent tool approval is not a general sandbox around
arbitrary extensions. See [commands](../extend/commands.md) and [plugins](../extend/plugins.md).
