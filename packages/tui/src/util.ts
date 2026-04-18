import { createHash } from "node:crypto"

export function ohash(obj: object, opts?: { force?: boolean }): string {
  const h = obj as { hash?: string }
  if (opts?.force !== true && h.hash) return h.hash
  delete h.hash
  h.hash = createHash("sha256").update(JSON.stringify(obj)).digest("hex")
  return h.hash
}
