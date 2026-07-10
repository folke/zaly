# Public README design

## Goal

Turn the root README into zaly's canonical product guide before the repository becomes public. It should explain what makes zaly useful, get a new user running quickly, and document the most important in-app controls without becoming a complete or unstable reference manual.

`packages/cli/README.md` will remain a short npm-facing entry point and link to the root guide instead of duplicating it.

## Audience and tone

The primary audience is developers evaluating or installing a terminal coding agent. Copy should be direct, concrete, and easy to scan, following the style of `sidekick.nvim`: strong feature groups, a practical quick start, compact tables, and short operational notes. Avoid marketing claims that are not directly supported by the current implementation.

## Root README structure

1. Hero with the tagline “Hackable terminal coding agent,” a short description, and the existing alpha warning.
2. Features grouped around:
   - terminal-native workflow;
   - models and providers;
   - persistent sessions and context management;
   - tools, background tasks, and permissions;
   - commands, skills, resource packs, themes, and TypeScript plugins.
3. Requirements: Node.js 22.11 or newer, model/provider credentials, and a modern terminal; terminal graphics remain optional.
4. Installation and quick start using npm or Bun, with `zaly --yolo` as the recommended alpha experience.
5. A prominent permissions section explaining that `yolo` allows all tool calls and should only be used in trusted projects/environments. Document one-off `zaly --yolo` and persistent configuration through `/config` with `permissions.preset = "yolo"`.
6. Essential actions table covering `/help`, `/login`, `/model`, `/effort`, `/context`, `/tree`, `/new`, `/resume`, `/compact`, `/config`, `/resources`, `/plugins`, `/theme`, `/stop`, `Ctrl-Y`, and `/history`. Leave exhaustive action discovery to `/help`.
7. A conceptual customization section for user/project settings, commands, skills, resources, themes, and plugins. Avoid exhaustive alpha-era schemas.
8. Terminal notes covering fullscreen and scrollback modes, clipboard caveats, Kitty Graphics Protocol, tmux passthrough, and graceful operation without graphics.
9. Existing monorepo package table and contributor commands moved near the bottom.
10. Status and license.

## CLI package README

Keep `packages/cli/README.md` intentionally short:

- package name and tagline;
- alpha warning;
- npm and Bun installation commands;
- link to the canonical root README on GitHub;
- license.

Use an absolute GitHub link so it works on npmjs.com.

## Validation

- Cross-check every feature and action against current source.
- Check all internal and npm-visible links.
- Run formatting/linting after edits.
- Search for duplicated or stale wording in both READMEs.
