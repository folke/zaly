// Bun runtime shim for ANSI/text primitives. Delegates to Bun's
// builtin helpers; `style/ansi.ts` wraps these with APC extraction
// and the user-facing signatures.

export const _stringWidth = Bun.stringWidth
export const _sliceAnsi = Bun.sliceAnsi
export const _wrapAnsi = Bun.wrapAnsi
