# Authentication and models

zaly separates the model you choose from the way you authenticate to its provider.
Available methods depend on the provider; not every provider supports every flow.

## API key

Run `/login`, choose a provider, and select API-key authentication when offered.
Alternatively, export a supported provider variable before starting zaly:

```sh
export OPENAI_API_KEY='your-api-key'
zaly
```

Common providers also recognize their configured variables, such as
`ANTHROPIC_API_KEY`. zaly loads `.env` in the working directory and in the user
configuration directory; keep those files out of version control.

`--api-key` overrides credentials for the selected model, but command-line
arguments may be visible in shell history/process listings. Prefer interactive
login or environment-based configuration when that matters.

## Browser and device login

Providers with OAuth support can offer browser authorization, a device-code flow,
or both. `/login` lists the methods actually available. Complete the flow using
the URL/code shown by zaly. Tokens are stored locally and refreshed when supported.

For subscription-backed OpenAI access, follow [ChatGPT subscription / Codex](./codex.md).
It is a separate provider from OpenAI's API-key service.

## Credential precedence

For a selected model/provider, zaly tries:

1. An explicit model API-key override, such as `--api-key`.
2. A stored API key.
3. Stored OAuth credentials.
4. Provider-configured key resolution.
5. The provider's configured environment variables.

This means changing an environment variable may not replace a credential already
stored for that provider. Credential storage is in the user state directory's
`auth.json`; see [paths](../reference/paths.md). Never share that file.

## Select and switch models

Use `/model` to choose a model, `/model --all` to include unauthenticated entries,
and `/model --refresh` to refresh provider model lists where supported. Switching
affects future requests, not a response already in flight.

At startup, use `zaly --model provider/model`. Bare startup prefers the resumed
session's model, then saved state, then the built-in fallback. `models.json` in
the user config directory is for model/provider overrides; it is not the credential store.

## Reasoning effort

Use `/reasoning` or `--reasoning` to choose reasoning effort. Available/effective
levels come from the provider/model's `reasoning_options` metadata, with explicit
provider quirks taking precedence. Unsupported choices are clamped to an available
level. On always-thinking models, `off` becomes the lowest supported effort;
otherwise it disables thinking. Missing API configuration leaves provider defaults
untouched. Older catalogs and custom models without this metadata remain supported.
Showing reasoning in the UI (`ui.reasoning`) is separate from selecting effort.

Check [CLI options](../reference/cli.md) for model-list filtering and startup flags.
