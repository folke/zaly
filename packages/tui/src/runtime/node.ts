// Runtime shim for Node. Mirrors `runtime/bun.ts` — the interface is
// identical so `style/ansi.ts` can import either and get the same
// surface. Raw, APC-unaware impls delegate to string-width / slice-ansi
// / wrap-ansi; `style/ansi.ts` wraps them with APC extraction.

export { default as _sliceAnsi } from "slice-ansi"
export { default as _stringWidth } from "string-width"
export { default as _wrapAnsi } from "wrap-ansi"

// oxlint-disable-next-line no-restricted-imports
export { renderMarkdown } from "../markdown/marked.ts"
