# Installation and terminals

## Requirements

- Node.js **22.18.0 or newer**.
- Linux or macOS. Windows is currently **untested**, not declared unsupported.
- Access to a supported model provider. Subscription-backed access and API-key
  billing are different; see [authentication](../configuration/models.md).

## Install

::: code-group

```sh [bun]
bun add -g @zaly/cli
```

```sh [npm]
npm install -g @zaly/cli
```

```sh [pnpm]
pnpm add -g @zaly/cli
```

:::

Check the installation with `zaly --version` and available flags with `zaly --help`.
Bun is an installation option; it is not required for the normal npm installation.

To update, run the same install command again. To uninstall, use
`npm uninstall -g @zaly/cli`, `bun remove -g @zaly/cli`, or
`pnpm remove -g @zaly/cli`, matching your installer.

## Terminal support

| Terminal  | zaly experience                                                      |
| --------- | -------------------------------------------------------------------- |
| Ghostty   | Full inline image support through the Kitty Graphics Protocol (KGP). |
| Kitty     | Full inline image support through KGP.                               |
| Alacritty | Good text-only experience.                                           |
| WezTerm   | Good text-only experience.                                           |
| iTerm2    | Good text-only experience.                                           |

This describes **zaly's current integration**, not every feature those terminals
support. Images require both terminal support and `ui.images` enabled. Sending
an image to a vision-capable model is separate from displaying images inline.

Modified keys, clipboard access, and graphics can behave differently through
SSH, multiplexers, or terminal-specific configuration. If a shortcut does not
arrive correctly, use the corresponding slash command where available.

## Display modes

The default is fullscreen. To preserve native terminal scrollback instead:

```sh
zaly --mode scrollback
```

Or set `ui.mode` in [configuration](../configuration/index.md). No terminal
customization is required to get started.
