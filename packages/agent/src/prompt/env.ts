import type { PromptCtx } from "./index.ts"

import os from "node:os"

export function prompt(ctx: PromptCtx): string {
  const lines = [
    "## Environment",
    `- Platform: ${process.platform} (${os.release()})`,
    `- Arch: ${process.arch}`,
    process.env.SHELL ? `- Shell: ${process.env.SHELL}` : undefined,
    `- Runtime: ${runtime()}`,
    `- Cwd: ${ctx.cwd}`,
  ]
  return lines.filter(Boolean).join("\n")
}

function runtime(): string {
  if (typeof Bun !== "undefined") return `bun ${Bun.version}`
  return `node ${process.versions.node}`
}
