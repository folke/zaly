# CLI

Run `zaly --help` or `zaly models --help` for installed-version help. See [installation](../guide/installation.md) and [authentication](../configuration/models.md).

<!-- cli:start -->
## zaly

| Argument | Type | Description |
| --- | --- | --- |
| `--debug`, `-d` | `boolean` | Enable debug logging |
| `--model`, `-m` | `string` | Model id (provider/model). When omitted: uses the resumed session's model, else the last model saved in the user state directory, else a built-in fallback. |
| `--api-key` | `string` | Override API key for the selected provider |
| `--new`, `-n` | `boolean` | Start a new session instead of resuming the most recent one |
| `--session` | `string` | Session id, file path, cwd or glob pattern to resume |
| `--no-skills` | `boolean` | Don't load any skills |
| `--no-plugins` | `boolean` | Don't load any plugins |
| `--no-themes` | `boolean` | Don't load any themes |
| `--no-commands` | `boolean` | Don't load any commands |
| `--no-packs` | `boolean` | Don't load any resource packs |
| `--tools` | `string` | Tools to enable (comma-separated, or pass --tools repeatedly). Defaults to the standard tool list. |
| `--reasoning`, `--thinking` | `off, minimal, low, medium, high, xhigh, max` | Reasoning / thinking effort level |
| `--theme` | `string` | Theme name (bundled) or path to a theme file |
| `--list-themes` | `boolean` | List bundled themes and exit |
| `--cwd`, `-C` | `string` | Working directory |
| `--yolo`, `-y` | `boolean` | Use the yolo permissions preset (allow everything) |
| `--permission` | `strict, readonly, permissive, yolo` | Permission preset (strict=ask for operations, readonly=allow common inspection/dev commands and ask for writes, permissive=broader dev access, yolo=allow everything). Overrides `yolo` if both are present. |
| `--print-config` | `boolean` | Print the resolved config and exit |
| `--mode` | `scrollback, fullscreen` | Terminal mode |

## zaly models

| Argument | Type | Description |
| --- | --- | --- |
| `pattern` | `positional` | Substring filter for model ids |
| `--context-size` | `string` | Filter for models with at least this context size. Suffixes K, M, B accepted. |
| `--input` | `text, image, audio, video` | Filter for models accepting this input modality |
| `--all` | `boolean` | Show all catalog models, including those without local auth |
| `--json` | `boolean` | Emit raw catalog rows as JSON |
| `--limit` | `string` | Limit the number of models listed |
<!-- cli:end -->
