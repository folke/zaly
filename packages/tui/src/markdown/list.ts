import type { RenderCtx } from "../core/ctx.ts"
import type { MdCallbacks } from "./types.ts"

import { stringWidth } from "@zaly/shared/ansi"

interface ListState {
  block: boolean
  items: string[]
  /** Formatted output, set when the list closes. The parent `listItem`
   *  pulls it via `stack[depth+1]` and splices it onto its own body. */
  rendered?: string
}

const BULLETS = ["●", "○", "◆", "◇"] as const

type ListCallbacks = Pick<MdCallbacks, "list" | "listItem">

/**
 * Stack-based list renderer. Each depth has its own `ListState`. Inner
 * lists return `""` and stash their formatted output on `state.rendered`;
 * the parent `listItem` pulls + splices, so inner output never reaches
 * the parent's `children` string. That keeps each level's loose-vs-tight
 * verdict independent — `children.endsWith("\n\n")` is then the per-item
 * loose signal (parser only emits `<p>` for items in loose lists).
 *
 * Nested list lands at the end of its parent's body — `text, list, more`
 * is rare in real markdown and not worth the extra plumbing.
 */
export function createListCallbacks(ctx: RenderCtx): ListCallbacks {
  const s = ctx.style
  // Lazy-pushed on the first `listItem` at a given depth; consumed
  // either by the parent `listItem` (nested) or by `list(0)` (top).
  const stack: (ListState | undefined)[] = []

  return {
    list: (_children, meta) => {
      const state = stack[meta.depth]
      if (state === undefined || state.items.length === 0) return ""
      state.rendered = state.items.join(state.block ? "\n\n" : "\n")
      if (meta.depth > 0) return ""
      // Top-level: defensive stack reset + block-contract `\n\n` trailer.
      stack.length = 0
      return `${state.rendered}\n\n`
    },

    listItem: (children, meta) => {
      let marker = s.mdListBullet(
        meta.ordered ? `${(meta.start ?? 1) + meta.index}.` : BULLETS[meta.depth % BULLETS.length]
      )
      if (meta.checked !== undefined) {
        const ref = meta.checked ? "mdListChecked" : "mdListUnchecked"
        marker += ` ${s.add(ref)(meta.checked ? "[x]" : "[ ]")}`
      }
      const indent = "  ".repeat(stringWidth(marker))
      // Pull nested list output (if any) off the stack.
      const nested = stack[meta.depth + 1]
      stack[meta.depth + 1] = undefined
      // Trailing `\n\n` = loose signal. Nested output is in `rendered`,
      // not `children`, so it can't pollute this check.
      const block = children.endsWith("\n\n")
      const trimmed = children.replace(/\s*\n+$/, "").replace(/\n{3,}/g, "\n\n")
      // Splice nested after the prose; loose item adds a blank-row gap.
      let body = trimmed
      if (nested?.rendered !== undefined) {
        const sep = block ? "\n\n" : "\n"
        body = trimmed === "" ? nested.rendered : `${trimmed}${sep}${nested.rendered}`
      }
      const content = body
        .split("\n")
        .map((line, l) => {
          if (l === 0) return `${marker} ${line}`
          // Bare empty lines so loose `\n\n` separators stay clean.
          return line === "" ? "" : `${indent}${line}`
        })
        .join("\n")

      const state = (stack[meta.depth] ??= { block: false, items: [] })
      state.block ||= block
      state.items.push(content)
      return ""
    },
  }
}
