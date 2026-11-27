import type { PromptCtx } from "./registry.ts"

export function prompt({ session }: PromptCtx): string {
  return session.path ? `## Session\n- path: ${session.path}` : ""
}
