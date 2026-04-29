import { box, markdown } from "@zaly/tui"

/**
 * A streaming-capable assistant bubble. Returns the outer box (for the
 * stream surface) and the inner markdown node so callers can mutate
 * `inner.state.content` token-by-token — the canonical streaming
 * pattern from tui/demo/stream.ts.
 */
export function assistantMessage(initial = ""): {
  node: ReturnType<typeof box>
  inner: ReturnType<typeof markdown>
} {
  const inner = markdown(initial, { wrap: "word" })
  const node = box({ padding: [1, 1, 0, 1] }, inner)
  return { inner, node }
}
