# Paths and environment

Linux and macOS use XDG-style defaults. macOS does not currently use a separate
Library/Application Support mapping in zaly.

| Kind                              | Default                                         |
| --------------------------------- | ----------------------------------------------- |
| Configuration/resources           | `$XDG_CONFIG_HOME/zaly` or `~/.config/zaly`     |
| Data, installed plugins, sessions | `$XDG_DATA_HOME/zaly` or `~/.local/share/zaly`  |
| State and credentials             | `$XDG_STATE_HOME/zaly` or `~/.local/state/zaly` |
| Logs                              | State directory's `log/`                        |
| Cache                             | `$XDG_CACHE_HOME/zaly` or `~/.cache/zaly`       |

Important files/directories:

- Config directory: `config.json`, `models.json`, `.env`, `commands/`, `skills/`,
  `themes/`, and `plugins/`.
- State directory: `state.json` for cross-run preferences and `auth.json` for
  credentials. Neither is the project configuration file.
- Data directory: `sessions/` for persisted histories and `plugins/` for installed
  plugin material. Local plugin source in config and installed plugin data are distinct.
- Project `.zaly/`: `config.json` and project-local resource directories. Discovery
  searches upward to the project boundary; see [configuration](../configuration/index.md).

## Overrides

| Variable       | Meaning                                                                                                    |
| -------------- | ---------------------------------------------------------------------------------------------------------- |
| `ZALY_CONFIG`  | Override the configuration directory.                                                                      |
| `ZALY_DATA`    | Override the data directory.                                                                               |
| `ZALY_STATE`   | Override the state directory.                                                                              |
| `ZALY_CACHE`   | Override the cache directory.                                                                              |
| `ZALY_LOG`     | Override the log directory.                                                                                |
| `ZALY_TMP`     | Override the temporary directory.                                                                          |
| `ZALY_ROOT`    | Put these directories under one root, using `config`, `data`, `state`, `cache`, `log`, and `tmp` children. |
| `ZALY_APPNAME` | Change the app directory name used by default mappings.                                                    |

An individual `ZALY_*` directory override takes precedence over `ZALY_ROOT`, which
takes precedence over platform/XDG defaults. These variables redirect user paths;
they do not replace project `.zaly/` discovery.

Provider API keys are described under [authentication](../configuration/models.md).
`BRAVE_API_KEY` enables the built-in Brave search tool in the default tool list.

## Safe cleanup

Back up before removing state or data. Removing sessions loses resumable histories;
removing credentials requires login again; removing state loses saved preferences.
Do not assume all installed plugin material is disposable if you modified it locally.
Cache is different from session data. Close running zaly processes before cleanup,
and use `--print-config` plus `/session` to identify the relevant paths first.
