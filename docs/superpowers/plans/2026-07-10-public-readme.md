# Public README Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the root README into zaly's canonical product guide and reduce the CLI package README to a stable npm-facing entry point.

**Architecture:** Product documentation lives in the root `README.md`, where GitHub visitors see it immediately. `packages/cli/README.md` contains only package installation essentials and an absolute link to the canonical guide, avoiding duplicated alpha-era documentation.

**Tech Stack:** Markdown, npm package metadata, zaly CLI actions and configuration.

## Global Constraints

- Keep the exact tagline: “Hackable terminal coding agent.”
- Clearly label zaly as alpha software.
- Require Node.js 22.11 or newer.
- Recommend the `yolo` permission preset for the current alpha experience while clearly warning that it permits all tool calls.
- Document only current, source-verified features and actions.
- Keep exhaustive action discovery in `/help`; this README is not a full reference manual.
- Use an absolute GitHub URL from the npm-visible CLI README.
- Do not add dependencies or generated documentation machinery.

---

### Task 1: Canonical product README

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: current behavior from `packages/cli/src/app/actions.ts`, CLI flags from `packages/cli/src/cli.ts`, defaults from `packages/config/src/defaults.ts`, and package links under `packages/*`.
- Produces: the canonical public product guide linked from npm and GitHub.

- [ ] **Step 1: Replace the root README with the approved product structure**

Write a README containing these sections in this order:

1. `# zaly`, the exact tagline, a concise description, and the alpha warning.
2. `## ✨ Features`, grouped into terminal workflow, models/providers, sessions/context, tools/permissions, and hackability.
3. `## 📋 Requirements`, listing Node.js `>=22.11`, provider credentials, and a modern terminal.
4. `## 🚀 Install`, showing npm and Bun installation.
5. `## ⚡ Quick start`, showing `cd your-project` and `zaly --yolo`, then `/login` and `/model` discovery notes.
6. `## 🔐 Permissions`, with this persistent configuration example:

```json
{
  "permissions": {
    "preset": "yolo"
  }
}
```

7. `## ⌨️ Essential actions`, with a compact table for:
   - `/help` and `Ctrl-H`
   - `/login`
   - `/model`
   - `/effort`
   - `/context`
   - `/tree`
   - `/new`
   - `/resume`
   - `/compact`
   - `/config`
   - `/resources`
   - `/plugins`
   - `/theme`
   - `/stop` and `Esc`
   - `Ctrl-Y`
   - `/history` and `Ctrl-R`
8. `## 🧩 Customization`, explaining user/project settings, commands, skills, resources, themes, and TypeScript plugins without documenting unstable schemas.
9. `## 🖥️ Terminal notes`, covering fullscreen/scrollback, clipboard caveats, optional Kitty graphics, and tmux passthrough.
10. `## 📦 Packages`, moving the existing package table near the bottom.
11. `## 🛠️ Development`, retaining Bun workspace commands.
12. `## Status` and `## License`.

Use concrete feature copy along these lines:

```markdown
- **A terminal UI built for agent work** — use a focused fullscreen interface or
  keep native terminal scrollback. Streaming Markdown, syntax highlighting,
  overlays, mouse support, selection, clipboard integration, themes, and terminal
  images are built in.
- **Choose the right model per task** — authenticate with multiple providers,
  browse available models, switch models mid-session, and tune reasoning effort
  without restarting zaly.
- **Sessions that can keep going** — sessions persist and resume per workspace.
  Inspect the exact context sent to the model, browse the message tree, compact old
  history, and let automatic masking keep large tool results under control.
- **Tools without blocking the conversation** — long-running tools become managed
  background tasks. Stop a turn, inspect task progress, and keep working without
  losing the session.
- **Explicit permissions** — choose strict, readonly, permissive, or yolo presets,
  then refine behavior with per-tool allow, ask, and deny rules.
- **Hackable by design** — add commands, reusable skills, resource packs, themes,
  and TypeScript plugins at user or project scope. Reload resources without
  restarting the app.
```

- [ ] **Step 2: Cross-check every documented action and feature**

Run:

```sh
rg 'cmd: "(help|login|model|effort|context|tree|new|resume|compact|config|resources|plugins|theme|stop|history)"' \
  packages/cli/src/app/actions.ts
```

Expected: every documented slash action appears in `appActions()`.

Check permission names:

```sh
rg '"strict"|"readonly"|"permissive"|"yolo"' packages/agent/src/permissions packages/config/src
```

Expected: all four documented presets are present.

- [ ] **Step 3: Review the README for unsupported claims and stale wording**

Run:

```sh
rg -n 'iTerm|slash command|Node 24|Pre-0\.1|TODO|TBD' README.md
```

Expected: no matches.

- [ ] **Step 4: Commit the canonical README**

```sh
git add README.md
git commit -m "docs: add public zaly guide"
```

---

### Task 2: npm-facing CLI README and verification

**Files:**
- Modify: `packages/cli/README.md`

**Interfaces:**
- Consumes: canonical guide at `https://github.com/folke/zaly#readme`.
- Produces: concise documentation rendered on the `@zaly/cli` npm package page.

- [ ] **Step 1: Replace the CLI package README with a concise entry point**

Use this structure:

~~~~markdown
# @zaly/cli

Hackable terminal coding agent.

> [!WARNING]
> zaly is alpha software. APIs, configuration, session formats, and behavior may
> change before 1.0.

## Install

```sh
npm install -g @zaly/cli
# or
bun add -g @zaly/cli
```

Node.js 22.11 or newer is required.

See the [zaly README](https://github.com/folke/zaly#readme) for features, quick
start, permissions, actions, configuration, and terminal notes.

## License

MIT © Folke Lemaitre
~~~~

- [ ] **Step 2: Verify links, metadata, formatting, and lint**

Run:

```sh
rg -n '\]\((\.\./\.\./LICENSE|\.\./|\./packages)' packages/cli/README.md
```

Expected: no relative links that can break on npm.

Run:

```sh
bun z fmt --check README.md packages/cli/README.md
bun z lint
```

Expected: formatting succeeds; lint exits 0 with only the two existing FIXME warnings.

- [ ] **Step 3: Inspect the final documentation diff**

Run:

```sh
git diff --check
git diff -- README.md packages/cli/README.md
```

Expected: no whitespace errors; the root README is canonical and the CLI README contains no duplicated feature reference.

- [ ] **Step 4: Commit the CLI README**

```sh
git add packages/cli/README.md
git commit -m "docs: link CLI package to public guide"
```
