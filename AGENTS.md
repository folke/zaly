# AGENTS.md

Project guidance for AI agents working in this repository.

## Tooling

- Bun workspace monorepo. Use Bun, not npm/pnpm/yarn, for normal development.
- Runtime requirements: Node >= 22.18.0, Bun >= 1.2. CI tests Node 22.18.0 and Bun 1.4.3.
- Fast test loop: `bun test`, or a focused path such as `bun test packages/agent/test/permissions.test.ts`.
- Import test APIs **only from `vitest`**, never `bun:test`; Bun substitutes its own implementations.
- `bun z test` runs Vitest under Node; `bun z test --bun` runs both runtimes, as CI does.
- `AGENT=1` / `AI_AGENT=zaly` enables compact tool output.
- Use the `@zaly/dev` wrapper for project tooling:
  - `bun z lint` — oxlint with TypeScript diagnostics; root lint also requires `actionlint` on PATH.
  - `bun z fmt` — oxfmt.
  - `bun z build` — standalone validators/JSON schemas, build scripts, and tsdown bundles/declarations.
  - `bun z api` — API surface reports via API Extractor.
- Run from the repository root for workspace-wide operations, or inside a package for supported package-local operations.
- Prefer `rg`/`fd` for searching; use `rekal` for indexed notes when relevant.

## Repository map

- `packages/ai` — providers, authentication, models, content transforms, validation, and tool definitions.
- `packages/agent` — agent loop (`src/agent.ts`), background tasks, permissions, sessions, compaction, tools, commands, skills, and subagents.
- `packages/tui` — reactive core, layout, terminal rendering, widgets, Markdown, themes, and Shiki services.
- `packages/cli` — CLI entry/env setup (`src/main.ts`), app lifecycle, agent wiring, and app-specific widgets.
- `packages/config` — configuration, resources, plugins, and generated schemas.
- `packages/shared` — shared utilities, process spawning, paths, templates, and image helpers.
- `packages/plugin` — public plugin API.
- `packages/dev` — private `z` development and release tooling.
- `plugins/` — local plugin workspace.

## Working conventions

- Read before editing, match existing style, and keep changes focused. No new dependencies unless requested.
- Prefer focused tests while iterating; run the full suite and both runtimes before final verification when practical.
- Author TypeBox schemas in `src/schemas/tpl/<name>.ts`; `bun z build` generates `assets/schemas/<name>.schema.json` and standalone `src/schemas/gen/<name>.ts` validators. Typed runtime APIs live in `src/schemas/<name>.ts`. Never edit generated validators directly. Use `bun z build --no-schemas` to skip schema generation.
- Review and include intentional generated changes. CI fails if builds/tests modify tracked files, including schemas and package build metadata.
- For permission changes, check `permissions.test.ts`, `presets.test.ts`, and `permissions-wire.test.ts` in `packages/agent/test`.
- For TUI rendering changes, check both `packages/tui/test/renderer` and `packages/tui/test/terminal`. Raw output intentionally includes ANSI control sequences.
- `Stream` maintains the terminal row mirror; `Node.render()` owns render caching/invalidation.
- For exports, assets, or worker changes, verify packed-package smoke tests—not just workspace imports. See the release guide below.

## Documentation and releases

- Root `docs/` is reserved for the user-facing website. Package-specific contributor/embedding guides belong in `packages/<name>/docs/` where needed.
- Keep READMEs concise and link to deeper guides. Contributor entry point: [CONTRIBUTING.md](./CONTRIBUTING.md).
- Use conventional commits such as `fix(tui): ...` or `feat(agent): ...`.
- One root release/changelog and bare `v<version>` tags; release-please updates all seven public package versions. Don't bump versions individually.
- Release, packing, publication, and recovery: [packages/dev/docs/releases.md](./packages/dev/docs/releases.md).
