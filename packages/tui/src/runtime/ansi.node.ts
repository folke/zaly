// oxlint-disable no-restricted-imports
// Node runtime shim for ANSI/text primitives. Mirrors `ansi.bun.ts` —
// same surface, string-width / slice-ansi / wrap-ansi under the hood.
// `style/ansi.ts` wraps these with APC extraction.

export { default as _sliceAnsi } from "slice-ansi"
export { default as _stringWidth } from "string-width"
export { default as _wrapAnsi } from "wrap-ansi"
