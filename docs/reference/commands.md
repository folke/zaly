# Built-in commands

Type `/` to discover commands, or use `/help`. Plugins, skills, and custom commands can add more. Argument flags below come from the built-in action definitions.

<!-- commands:start -->
## /context

Show a tree view of the current session's context.

Action: `agent.context`


## /model

Switch the model used for future agent turns.

Action: `agent.model`

- `--all`: Show all models, including non-authenticated ones (boolean)
- `--refresh`: Refresh the model list from the provider (boolean)

## /reasoning

Change how much reasoning the model uses for future turns.

Action: `agent.reasoning`


## /session

Show the current session's id, path, and settings.

Action: `agent.session`


## /clear

Clear the current composer input.

Action: `app.clear`


## /compact

Summarize older history while preserving recent messages.

Action: `app.compact`


## /help

Show or hide the keyboard shortcut help overlay.

Action: `app.help`


## /login

Authenticate with a model provider

Action: `app.login`

- `--model`: Authenticate with the current model provider (boolean)

## /pwd

Show the workspace directory the agent is running in.

Action: `app.pwd`


## /reload

Reload plugins & resources

Action: `app.reload`


## /scroll-bottom

Scroll to the bottom of the message history.

Action: `app.scroll-bottom`


## /scroll-top

Scroll to the top of the message history.

Action: `app.scroll-top`


## /stop

Stop the current agent turn or running tool batch.

Action: `app.stop`


## /theme

Choose a color theme for the current TUI session.

Action: `app.theme`


## /history

Browse and pick from recent composer inputs.

Action: `composer.history`


## /config

Edit the current workspace configuration.

Action: `config.edit`

- `--project`: Edit the project config file (boolean)
- `--user`: Edit the user config file. (boolean)

## /quit

Quit zaly.

Action: `global.quit`


## /install

Install one or more plugins

Action: `plugins.install`

- `plugins`: The plugin URI(s) to install. (string)
- `--project`: Install a plugin in the current project. (boolean)
- `--user`: Install a plugin in the user config. (boolean)

## /plugins

Manage installed plugins.

Action: `plugins.manage`


## /update

Update all installed plugins.

Action: `plugins.update`


## /resources

Pick which resources are enabled in the current workspace.

Action: `resources.pick`

- `--plugin`: Configure plugin resources only. (boolean)
- `--project`: Configure project resources only. (boolean)
- `--user`: Configure user resources only. (boolean)

## /new

Start a new session in the current workspace.

Action: `session.new`


## /resume

Resume a session in the current workspace.

Action: `session.resume`


## /tree

Show a tree view of the current session's message history.

Action: `session.tree`
<!-- commands:end -->
