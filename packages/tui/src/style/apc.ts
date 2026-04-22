// APC (Application Program Command) escapes — `ESC _ ... ESC \` — are
// side-channel payloads the terminal consumes silently (e.g. the Kitty
// graphics protocol image transmits and placements). They have zero
// visible width and must survive layout operations without being
// truncated. Our runtime string shims pre-extract APCs before delegating
// to string-width / slice-ansi / wrap-ansi, then re-prepend them to the
// result.

const APC_RE = /\u001B_[\s\S]*?\u001B\\/g

/** @internal */
export function extractApc(s: string): { apc: string; rest: string } {
  if (!s.includes("\u001B_")) return { apc: "", rest: s }
  let apc = ""
  const rest = s.replace(APC_RE, (m) => {
    apc += m
    return ""
  })
  return { apc, rest }
}
