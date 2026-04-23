// Node runtime shim for `renderMarkdown`. Split from `ansi.node.ts` so
// the marked package (~100ms of init) only loads when the markdown
// widget (or `@zaly/tui/md`) is actually imported.

// oxlint-disable-next-line no-restricted-imports
export { renderMarkdown } from "../markdown/marked.ts"
