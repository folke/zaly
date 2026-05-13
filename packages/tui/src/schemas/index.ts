// Canonical entry point for schema validators + JSON schemas. Consumers
// should always import from here — the `gen/` output and `tpl/` sources
// are implementation details of the typia build pipeline. The
// `no-restricted-imports` rule enforces that from outside this file;
// relative imports inside the `schemas/` dir are unaffected.

export { validateTheme } from "./gen/theme.config.ts"
export { isShikiLang } from "./gen/shiki.ts"
export { isShikiTheme } from "./gen/shiki.ts"
