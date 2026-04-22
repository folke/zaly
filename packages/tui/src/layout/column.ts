export interface StackOpts {
  gap: number
  width: number
}

/**
 * Stack pre-rendered child rows vertically. `gap` blank rows of `width` spaces
 * separate each sibling pair. Caller must ensure each child's rows are already
 * padded to `width`.
 *
 * @internal
 */
export function stackColumn(children: readonly (readonly string[])[], opts: StackOpts): string[] {
  const out: string[] = []
  const blank = " ".repeat(opts.width)
  for (let i = 0; i < children.length; i++) {
    if (i > 0) for (let g = 0; g < opts.gap; g++) out.push(blank)
    out.push(...children[i])
  }
  return out
}
