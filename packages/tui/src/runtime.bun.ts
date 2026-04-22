// Runtime shim for Bun. Exports the raw, APC-unaware impls from the
// Bun builtin helpers; `style/ansi.ts` wraps these with APC extraction
// and the user-facing signatures.

import type { MdCallbacks, MdCodeBlockMeta, MdOptions } from "./style/md/index.ts"

import { encodeFenceInfoStrings, parseCodeInfoString } from "./style/md/utils.ts"

export const _stringWidth = Bun.stringWidth
export const _sliceAnsi = Bun.sliceAnsi
export const _wrapAnsi = Bun.wrapAnsi

/**
 * Bun wrapper for `renderMarkdown`. `Bun.markdown.render` truncates code
 * fence info-strings at the first whitespace, so attrs like
 * `title="foo.ts"` never make it through. We pre-encode the spaces as
 * NUL sentinels and decode the full string back into `{ language, title }`
 * inside the `code` callback. Node's marked-backed impl parses info-
 * strings natively, so the equivalent dance lives only here.
 */
export function renderMarkdown(input: string, callbacks: MdCallbacks, opts?: MdOptions): string {
  const encoded = encodeFenceInfoStrings(input)
  const wrapped: MdCallbacks =
    callbacks.code === undefined
      ? callbacks
      : {
          ...callbacks,
          code: (text, meta) => callbacks.code!(text, decodeCodeMeta(meta)),
        }
  return Bun.markdown.render(encoded, wrapped, opts)
}

function decodeCodeMeta(meta: MdCodeBlockMeta | undefined): MdCodeBlockMeta | undefined {
  if (meta === undefined) return undefined
  if (meta.title !== undefined) return meta
  if (meta.language === undefined) return meta
  return parseCodeInfoString(meta.language) ?? meta
}
