import { box, signal, text } from "@zaly/tui"

/**
 * A streaming-capable reasoning bubble. Distinct visual treatment from
 * `assistantMessage` (dimmed, plain text rather than markdown) so the
 * user can scan reasoning vs reply at a glance. `append(delta)` grows
 * the visible text token-by-token.
 *
 * Plain `text` (not `markdown`) on purpose: reasoning streams are
 * usually flowing prose, often half-formed; running them through a
 * markdown parser per token makes mid-stream output flicker. Word-wrap
 * is enough.
 */
export function reasoningMessage(initial = ""): {
  node: ReturnType<typeof box>
  append: (delta: string) => void
} {
  const [content, setContent] = signal(initial)
  const node = box(
    { padding: [1, 1, 0, 1] },
    text(({ style }) => (content() === "" ? "" : style.dim(content())), { wrap: "word" })
  )
  return {
    append: (delta) => setContent(content() + delta),
    node,
  }
}
